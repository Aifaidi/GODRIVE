import { useEffect, useState, useRef } from 'react'
import { useAuth } from 'react-oidc-context'
import Login from './Login'
import axios from 'axios'
import { AuthenticatedImage } from './components/AuthenticatedImage'
import {
    Search, Plus, HardDrive, Users, Clock, Star, Trash2,
    Settings, HelpCircle, Folder as FolderIcon, File as FileIcon,
    Download, Edit2, X, ChevronRight, ArrowLeft, ArrowRight,
    Image as ImageIcon, FileText, Music, Video, RotateCcw, LogOut
} from 'lucide-react'

// --- Types ---
interface File {
    id: number
    name: string
    size: number
    created_at: string
    is_starred: boolean
    deleted_at?: string
}

interface Folder {
    id: number
    name: string
    created_at: string
    is_starred: boolean
    deleted_at?: string
}

interface ApiResponse {
    files: File[]
    folders: Folder[]
}

type ViewType = 'my-files' | 'recent' | 'starred' | 'trash'

// --- Helper Functions ---
const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return <ImageIcon className="text-red-500" />
    if (['pdf', 'txt', 'doc', 'docx'].includes(ext || '')) return <FileText className="text-blue-500" />
    if (['mp3', 'wav'].includes(ext || '')) return <Music className="text-purple-500" />
    if (['mp4', 'mov'].includes(ext || '')) return <Video className="text-green-500" />
    return <FileIcon className="text-gray-500" />
}

const isImage = (filename: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(filename)

function App() {
    // --- State ---
    const [currentView, setCurrentView] = useState<ViewType>('my-files')
    const [currentFolderId, setCurrentFolderId] = useState<number | null>(null)
    const [data, setData] = useState<ApiResponse>({ files: [], folders: [] })
    const [path, setPath] = useState<{ id: number | null, name: string }[]>([{ id: null, name: 'My Files' }])
    const [selectedItem, setSelectedItem] = useState<{ type: 'file' | 'folder', data: File | Folder } | null>(null)
    const [previewFile, setPreviewFile] = useState<File | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [uploading, setUploading] = useState(false)
    const auth = useAuth()

    // Storage Quota
    const [storage, setStorage] = useState<{ used: number, limit: number }>({ used: 0, limit: 15 * 1024 * 1024 * 1024 })

    // Modals
    const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false)
    const [newFolderName, setNewFolderName] = useState('')

    // Context Menu
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, item: { type: 'file' | 'folder', data: File | Folder } } | null>(null)

    const fileInputRef = useRef<HTMLInputElement>(null)

    // --- Auth Side Effects ---
    useEffect(() => {
        if (auth.user?.access_token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${auth.user.access_token}`
        } else {
            delete axios.defaults.headers.common['Authorization']
        }
    }, [auth.user?.access_token])

    // --- Effects ---
    useEffect(() => {
        if (auth.isAuthenticated) {
            fetchData()
            fetchStorage()
        }
        setSelectedItem(null)
        setContextMenu(null)
    }, [currentFolderId, currentView, auth.isAuthenticated])

    // Keyboard & Click Outside Support
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (previewFile) {
                if (e.key === 'Escape') closePreview()
                else if (e.key === 'ArrowLeft') navigateImage(-1)
                else if (e.key === 'ArrowRight') navigateImage(1)
            }
        }
        const handleClickOutside = () => setContextMenu(null)

        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('click', handleClickOutside)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('click', handleClickOutside)
        }
    }, [previewFile, data.files])

    // --- Render Login/Loading/Error/App ---
    if (auth.isLoading) {
        return <div className="flex items-center justify-center h-screen bg-white text-gray-500">Loading auth...</div>
    }

    if (auth.error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-red-50 text-red-600 p-8 text-center">
                <h2 className="text-2xl font-bold mb-4">Authentication Error</h2>
                <pre className="bg-white p-4 rounded shadow text-left overflow-auto max-w-2xl border border-red-200">
                    {JSON.stringify(auth.error, null, 2)}
                </pre>
                <button
                    onClick={() => auth.signinRedirect()}
                    className="mt-8 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-lg"
                >
                    Retry Login
                </button>
            </div>
        )
    }

    if (!auth.isAuthenticated) {
        return <Login />
    }

    // --- Actions ---
    const fetchData = async () => {
        try {
            let url = '/api/browse'
            const params = new URLSearchParams()

            if (currentView === 'my-files') {
                if (currentFolderId !== null) params.append('parent_id', currentFolderId.toString())
            } else {
                params.append('view', currentView)
            }

            const res = await axios.get(`${url}?${params.toString()}`)
            setData(res.data)
        } catch (err) {
            console.error("Fetch error", err)
        }
    }

    const fetchStorage = async () => {
        try {
            const res = await axios.get('/api/storage')
            setStorage(res.data)
        } catch (err) { console.error(err) }
    }

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return
        setUploading(true)
        const file = e.target.files[0]
        const formData = new FormData()
        formData.append('file', file)
        if (currentView === 'my-files' && currentFolderId !== null) {
            formData.append('parent_id', currentFolderId.toString())
        }

        try {
            await axios.post('/api/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
            fetchData()
            fetchStorage()
        } catch (err) {
            alert("Upload failed")
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return
        try {
            await axios.post('/api/folder', { name: newFolderName, parent_id: currentFolderId })
            fetchData()
            setIsNewFolderModalOpen(false)
            setNewFolderName('')
        } catch (err) {
            alert("Failed to create folder")
        }
    }

    const handleRename = async (item: { type: 'file' | 'folder', data: File | Folder }) => {
        const newName = prompt("New name?", item.data.name)
        if (!newName || newName === item.data.name) return
        try {
            await axios.put(`/api/rename/${item.type}/${item.data.id}`, { name: newName })
            fetchData()
            setSelectedItem(null)
        } catch (err) { alert("Rename failed") }
    }

    const handleDownload = (file: File) => {
        const link = document.createElement('a')
        link.href = `/api/file/${file.id}/content?download=true`
        link.download = file.name
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const handleToggleStar = async (item: { type: 'file' | 'folder', data: File | Folder }) => {
        try {
            await axios.post(`/api/star/${item.type}/${item.data.id}`)
            fetchData() // Refresh to update UI everywhere
        } catch (err) { alert("Action failed") }
    }

    const handleTrash = async (item: { type: 'file' | 'folder', data: File | Folder }, restore: boolean = false) => {
        try {
            const url = `/api/trash/${item.type}/${item.data.id}${restore ? '?restore=true' : ''}`
            await axios.delete(url)
            fetchData()
            setSelectedItem(null)
        } catch (err) { alert("Action failed") }
    }

    // --- Navigation & Views ---
    const switchToView = (view: ViewType) => {
        setCurrentView(view)
        setCurrentFolderId(null)
        setPath([{ id: null, name: view === 'my-files' ? 'My Files' : view.charAt(0).toUpperCase() + view.slice(1) }])
    }

    const navigateToFolder = (folder: Folder) => {
        if (currentView !== 'my-files') return
        setPath([...path, { id: folder.id, name: folder.name }])
        setCurrentFolderId(folder.id)
    }

    const navigateUp = (index: number) => {
        if (currentView !== 'my-files') return
        const newPath = path.slice(0, index + 1)
        setPath(newPath)
        setCurrentFolderId(newPath[newPath.length - 1].id)
    }

    // --- Selection & Preview ---
    const handleItemClick = (type: 'file' | 'folder', item: File | Folder) => {
        setSelectedItem({ type, data: item })
    }

    const handleItemDoubleClick = (type: 'file' | 'folder', item: File | Folder) => {
        if (type === 'folder') navigateToFolder(item as Folder)
        else {
            const file = item as File
            if (isImage(file.name)) setPreviewFile(file)
            else window.open(`/api/file/${file.id}/content`, '_blank')
        }
    }

    const handleContextMenu = (e: React.MouseEvent, type: 'file' | 'folder', item: File | Folder) => {
        e.preventDefault()
        e.stopPropagation()
        setContextMenu({ x: e.clientX, y: e.clientY, item: { type, data: item } })
        setSelectedItem({ type, data: item }) // Select on right click too
    }

    const closePreview = () => setPreviewFile(null)

    const getImages = () => data.files.filter(f => isImage(f.name))
    const navigateImage = (direction: number) => {
        if (!previewFile) return
        const images = getImages()
        if (images.length <= 1) return
        const currentIndex = images.findIndex(img => img.id === previewFile.id)
        if (currentIndex === -1) return
        let newIndex = currentIndex + direction
        if (newIndex < 0) newIndex = images.length - 1
        if (newIndex >= images.length) newIndex = 0
        setPreviewFile(images[newIndex])
    }

    // --- Empty State Render Helper ---
    const renderEmptyState = () => {
        let icon = <HardDrive size={48} className="text-gray-300" />
        let title = "Folder is empty"
        let sub = "Drag files here or use the Upload button"

        if (currentView === 'recent') {
            icon = <Clock size={48} className="text-gray-300" />
            title = "No recent files"
            sub = "Files you upload will appear here"
        } else if (currentView === 'starred') {
            icon = <Star size={48} className="text-gray-300" />
            title = "No starred files"
            sub = "Star files/folders to find them easily here"
        } else if (currentView === 'trash') {
            icon = <Trash2 size={48} className="text-gray-300" />
            title = "Trash is empty"
            sub = "Deleted items will appear here"
        }

        return (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400 select-none">
                <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    {icon}
                </div>
                <p className="text-lg font-medium text-gray-500">{title}</p>
                <p className="text-sm">{sub}</p>
            </div>
        )
    }


    return (
        <div className="flex h-screen w-screen bg-gray-50 text-gray-800 font-sans overflow-hidden" onContextMenu={(e) => e.preventDefault()}>

            {/* --- Sidebar --- */}
            <aside className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
                <div className="p-4 flex items-center gap-2 border-b border-gray-100">
                    <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold text-lg">G</div>
                    <span className="text-xl font-semibold text-gray-700">GoDrive</span>
                </div>

                <div className="p-3 space-y-2">
                    <button
                        className={`w-full flex items-center gap-2 px-4 py-3 bg-white text-gray-700 rounded-full shadow-sm border border-gray-200 hover:shadow-md hover:bg-gray-50 transition-all font-medium ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={uploading}
                        onClick={() => {
                            if (uploading) return
                            setIsNewFolderModalOpen(true)
                        }}
                    >
                        <Plus className="w-5 h-5 text-google-plus" />
                        <span>{uploading ? 'Uploading...' : 'New'}</span>
                    </button>

                    <button
                        className="w-full flex items-center gap-2 px-4 py-2 mt-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                    >
                        <HardDrive size={16} /> Upload File
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" />

                    <div className="border-t border-gray-100 my-2 pt-2">
                        <button
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            onClick={() => {
                                if (uploading) return
                                auth.signoutRedirect()
                            }}
                        >
                            <LogOut size={16} />
                            <span>Logout</span>
                        </button>
                    </div>
                </div>

                <nav className="flex-1 overflow-y-auto px-2 space-y-1">
                    <NavItem icon={<HardDrive size={18} />} label="My Files" active={currentView === 'my-files'} onClick={() => switchToView('my-files')} />
                    <NavItem icon={<Users size={18} />} label="Shared with me" />
                    <NavItem icon={<Clock size={18} />} label="Recent" active={currentView === 'recent'} onClick={() => switchToView('recent')} />
                    <NavItem icon={<Star size={18} />} label="Starred" active={currentView === 'starred'} onClick={() => switchToView('starred')} />
                    <NavItem icon={<Trash2 size={18} />} label="Trash" active={currentView === 'trash'} onClick={() => switchToView('trash')} />
                </nav>

                <div className="p-4 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-gray-600 mb-2">
                        <HardDrive size={16} />
                        <span className="text-sm font-medium">Storage</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1">
                        <div
                            className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min((storage.used / storage.limit) * 100, 100)}%` }}
                        ></div>
                    </div>
                    <p className="text-xs text-gray-500">{formatSize(storage.used)} of {formatSize(storage.limit)} used</p>
                </div>
            </aside>

            {/* --- Main Content --- */}
            <main className="flex-1 flex flex-col min-w-0" onClick={() => { setSelectedItem(null); setContextMenu(null) }}>
                {/* Header */}
                <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
                    <div className="flex-1 max-w-2xl px-4">
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600" size={20} />
                            <input
                                type="text"
                                placeholder="Search in Drive"
                                className="w-full bg-gray-100 border-none rounded-lg py-2.5 pl-10 pr-4 text-gray-700 focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all outline-none"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-4 text-gray-500">
                        <button className="p-2 hover:bg-gray-100 rounded-full"><HelpCircle size={20} /></button>
                        <button className="p-2 hover:bg-gray-100 rounded-full"><Settings size={20} /></button>
                        <div className="w-8 h-8 bg-purple-600 rounded-full text-white flex items-center justify-center font-bold text-sm">A</div>
                    </div>
                </header>

                {/* Toolbar & Breadcrumbs */}
                <div className="h-12 flex items-center justify-between px-4 border-b border-gray-100 flex-shrink-0 bg-white">
                    <div className="flex items-center gap-1 text-gray-600 text-sm overflow-hidden">
                        {path.map((p, i) => (
                            <div key={i} className="flex items-center">
                                {i > 0 && <ChevronRight size={14} className="mx-1 text-gray-400" />}
                                <button
                                    onClick={() => navigateUp(i)}
                                    className={`hover:bg-gray-100 px-2 py-1 rounded ${i === path.length - 1 ? 'font-semibold text-gray-800' : ''}`}
                                    disabled={currentView !== 'my-files'} // Disable nav in other views
                                >
                                    {p.name}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* File Grid */}
                <div className="flex-1 overflow-y-auto p-4">

                    {data.folders.length > 0 && (
                        <div className="mb-6">
                            <h2 className="text-sm font-medium text-gray-500 mb-3 px-2">Folders</h2>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                {data.folders.map(folder => (
                                    <div
                                        key={folder.id}
                                        className={`
                      flex items-center gap-3 p-3 rounded-lg border cursor-pointer select-none transition-all relative group
                      ${selectedItem?.type === 'folder' && selectedItem.data.id === folder.id
                                                ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-300'
                                                : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-sm'}
                    `}
                                        onClick={(e) => { e.stopPropagation(); handleItemClick('folder', folder) }}
                                        onDoubleClick={(e) => { e.stopPropagation(); handleItemDoubleClick('folder', folder) }}
                                        onContextMenu={(e) => handleContextMenu(e, 'folder', folder)}
                                    >
                                        <FolderIcon className={`w-5 h-5 ${selectedItem?.type === 'folder' && selectedItem.data.id === folder.id ? 'text-blue-600' : 'text-gray-500'}`} fill="currentColor" fillOpacity={0.2} />
                                        <span className="truncate text-sm font-medium text-gray-700">{folder.name}</span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleToggleStar({ type: 'folder', data: folder }) }}
                                            className={`absolute top-2 right-2 p-1 rounded-full hover:bg-gray-100 ${folder.is_starred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                                        >
                                            <Star size={14} className={`${folder.is_starred ? 'text-yellow-400 fill-current' : 'text-gray-400'}`} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {data.files.length > 0 && (
                        <div>
                            <h2 className="text-sm font-medium text-gray-500 mb-3 px-2">Files</h2>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                {data.files.map(file => (
                                    <div
                                        key={file.id}
                                        className={`
                       group flex flex-col bg-white border rounded-lg cursor-pointer select-none transition-all overflow-hidden relative
                       ${selectedItem?.type === 'file' && selectedItem.data.id === file.id
                                                ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-300'
                                                : 'border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md'}
                     `}
                                        onClick={(e) => { e.stopPropagation(); handleItemClick('file', file) }}
                                        onDoubleClick={(e) => { e.stopPropagation(); handleItemDoubleClick('file', file) }}
                                        onContextMenu={(e) => handleContextMenu(e, 'file', file)}
                                    >
                                        {/* Direct Star Action */}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleToggleStar({ type: 'file', data: file }) }}
                                            className={`absolute top-2 right-2 z-10 p-1.5 rounded-full hover:bg-white/80 ${file.is_starred ? 'opacity-100 bg-white shadow-sm' : 'opacity-0 group-hover:opacity-100 bg-gray-100/50'} transition-all`}
                                        >
                                            <Star size={14} className={`${file.is_starred ? 'text-yellow-400 fill-current' : 'text-gray-500'}`} />
                                        </button>

                                        <div className="h-32 bg-gray-50 flex items-center justify-center border-b border-gray-100 relative overflow-hidden">
                                            {isImage(file.name) ? (
                                                <AuthenticatedImage src={`/api/file/${file.id}/content`} alt={file.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="scale-150 transform">{getFileIcon(file.name)}</div>
                                            )}
                                        </div>
                                        <div className="p-3 flex items-center gap-3">
                                            <div className="flex-shrink-0">{getFileIcon(file.name)}</div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {data.files.length === 0 && data.folders.length === 0 && renderEmptyState()}
                </div>
            </main>

            {/* --- Right Details Sidebar --- */}
            {selectedItem && (
                <aside className="w-80 bg-white border-l border-gray-200 flex flex-col flex-shrink-0 p-4 transition-all z-10">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-medium text-gray-700 flex items-center gap-2">
                            {selectedItem.type === 'folder' ? <FolderIcon size={18} /> : getFileIcon(selectedItem.data.name)}
                            <span className="truncate max-w-[150px]">{selectedItem.data.name}</span>
                        </h3>
                        <button onClick={() => setSelectedItem(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                    </div>

                    <div className="flex-1">
                        {/* Preview in Sidebar */}
                        <div className="aspect-video bg-gray-50 rounded-lg flex items-center justify-center border border-gray-100 mb-6 overflow-hidden">
                            {selectedItem.type === 'file' && isImage(selectedItem.data.name) ? (
                                <AuthenticatedImage src={`/api/file/${selectedItem.data.id}/content`} alt={selectedItem.data.name} className="w-full h-full object-contain" />
                            ) : (
                                selectedItem.type === 'folder' ? <FolderIcon size={64} className="text-blue-200" /> : <FileIcon size={64} className="text-gray-300" />
                            )}
                        </div>

                        <div className="space-y-4">
                            <div>
                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Details</h4>
                                <div className="space-y-2 text-sm text-gray-600">
                                    <div className="flex justify-between py-1 border-b border-gray-50">
                                        <span>Type</span>
                                        <span>{selectedItem.type === 'folder' ? 'Folder' : selectedItem.data.name.split('.').pop()?.toUpperCase() || 'File'}</span>
                                    </div>
                                    {selectedItem.type === 'file' && (
                                        <div className="flex justify-between py-1 border-b border-gray-50">
                                            <span>Size</span>
                                            <span>{formatSize((selectedItem.data as File).size)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between py-1 border-b border-gray-50">
                                        <span>Created</span>
                                        <span>{new Date(selectedItem.data.created_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Actions in Sidebar */}
                            <div className="flex flex-col gap-2 mt-6">
                                {currentView === 'trash' ? (
                                    <>
                                        <button
                                            onClick={() => handleTrash(selectedItem, true)}
                                            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-50 text-green-700 rounded-md hover:bg-green-100 transition-colors text-sm font-medium"
                                        >
                                            <RotateCcw size={16} /> Restore
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (confirm("Delete forever?")) handleTrash(selectedItem, false)
                                            }}
                                            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-50 text-red-700 rounded-md hover:bg-red-100 transition-colors text-sm font-medium"
                                        >
                                            <Trash2 size={16} /> Delete Forever
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex gap-2">
                                            {selectedItem.type === 'file' && (
                                                <button
                                                    onClick={() => handleDownload(selectedItem.data as File)}
                                                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors text-sm font-medium"
                                                >
                                                    <Download size={16} /> Download
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleRename(selectedItem)}
                                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm font-medium"
                                            >
                                                <Edit2 size={16} /> Rename
                                            </button>
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleToggleStar(selectedItem)}
                                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md transition-colors text-sm font-medium 
                              ${selectedItem.data.is_starred ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                            >
                                                <Star size={16} className={selectedItem.data.is_starred ? 'fill-current' : ''} />
                                                {selectedItem.data.is_starred ? 'Starred' : 'Add to Starred'}
                                            </button>

                                            <button
                                                onClick={() => handleTrash(selectedItem)}
                                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-50 text-red-700 rounded-md hover:bg-red-100 transition-colors text-sm font-medium"
                                            >
                                                <Trash2 size={16} /> Trash
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </aside>
            )}

            {/* --- Context Menu --- */}
            {contextMenu && (
                <div
                    className="fixed bg-white border border-gray-200 shadow-lg rounded-md py-1 z-50 w-48 text-sm text-gray-700"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()} // Prevent close on click inside
                >
                    {currentView === 'trash' ? (
                        <>
                            <button onClick={() => { handleTrash(contextMenu.item, true); setContextMenu(null) }} className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-2">
                                <RotateCcw size={16} /> Restore
                            </button>
                            <button onClick={() => { if (confirm("Forever?")) handleTrash(contextMenu.item, false); setContextMenu(null) }} className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-2 text-red-600">
                                <Trash2 size={16} /> Delete Forever
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => { handleItemDoubleClick(contextMenu.item.type, contextMenu.item.data); setContextMenu(null) }} className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-2">
                                {contextMenu.item.type === 'folder' ? <FolderIcon size={16} /> : <FileText size={16} />} Open
                            </button>
                            {contextMenu.item.type === 'file' && (
                                <button onClick={() => { handleDownload(contextMenu.item.data as File); setContextMenu(null) }} className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-2">
                                    <Download size={16} /> Download
                                </button>
                            )}
                            <button onClick={() => { handleRename(contextMenu.item); setContextMenu(null) }} className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-2">
                                <Edit2 size={16} /> Rename
                            </button>
                            <div className="h-px bg-gray-100 my-1" />
                            <button onClick={() => { handleToggleStar(contextMenu.item); setContextMenu(null) }} className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-2">
                                <Star size={16} className={contextMenu.item.data.is_starred ? 'fill-yellow-400 text-yellow-400' : ''} />
                                {contextMenu.item.data.is_starred ? 'Remove Star' : 'Add to Starred'}
                            </button>
                            <button onClick={() => { handleTrash(contextMenu.item); setContextMenu(null) }} className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-2 text-red-600 hover:bg-red-50">
                                <Trash2 size={16} /> Move to Trash
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* --- Lightbox Modal --- */}
            {previewFile && (
                <div
                    className="fixed inset-0 z-50 bg-black bg-opacity-95 flex items-center justify-center backdrop-blur-sm focus:outline-none"
                    onClick={closePreview}
                    tabIndex={0}
                >
                    <button onClick={closePreview} className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 z-50 transition-colors">
                        <X size={32} />
                    </button>

                    {getImages().length > 1 && (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); navigateImage(-1); }}
                                className="absolute left-4 text-white/70 hover:text-white p-4 rounded-full hover:bg-white/10 z-50 transition-colors"
                            >
                                <ArrowLeft size={32} />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); navigateImage(1); }}
                                className="absolute right-4 text-white/70 hover:text-white p-4 rounded-full hover:bg-white/10 z-50 transition-colors"
                            >
                                <ArrowRight size={32} />
                            </button>
                        </>
                    )}

                    <div className="relative max-w-full max-h-full flex flex-col items-center p-4">
                        <AuthenticatedImage
                            src={`/api/file/${previewFile.id}/content`}
                            alt={previewFile.name}
                            className="max-w-full max-h-[85vh] object-contain rounded shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                        <div className="mt-4 text-white/90 font-medium text-lg drop-shadow-md flex items-center gap-2 bg-black/50 px-4 py-2 rounded-full backdrop-blur-md">
                            <ImageIcon size={18} />
                            {previewFile.name}
                            <span className="text-white/50 text-sm ml-2">({getImages().findIndex(f => f.id === previewFile.id) + 1} / {getImages().length})</span>
                        </div>
                    </div>
                </div>
            )}

            {/* --- Create Folder Modal --- */}
            {isNewFolderModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 transform transition-all scale-100">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">New Folder</h3>
                        <input
                            autoFocus
                            type="text"
                            placeholder="Folder Name"
                            className="w-full border border-gray-300 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 mb-6"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder() }}
                        />
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setIsNewFolderModalOpen(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md font-medium text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateFolder}
                                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md font-medium text-sm shadow-sm"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    )
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-r-full text-sm font-medium transition-colors
        ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}
      `}
        >
            {icon}
            <span>{label}</span>
            {active && <div className="ml-auto w-1.5 h-1.5 bg-blue-600 rounded-full mr-2" />}
        </button>
    )
}

export default App
