import { useEffect, useState } from 'react';
import axios from 'axios';
import { Image as ImageIcon, Loader2 } from 'lucide-react';

interface AuthenticatedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    alt: string;
    fallbackIcon?: boolean;
}

export function AuthenticatedImage({ src, alt, fallbackIcon = true, className, ...props }: AuthenticatedImageProps) {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let active = true;
        const fetchImage = async () => {
            try {
                setLoading(true);
                const response = await axios.get(src, { responseType: 'blob' });
                if (active) {
                    const url = URL.createObjectURL(response.data);
                    setImageSrc(url);
                    setLoading(false);
                }
            } catch (err) {
                console.error("Failed to load image:", src, err);
                if (active) {
                    setError(true);
                    setLoading(false);
                }
            }
        };

        fetchImage();

        return () => {
            active = false;
            // Cleanup blob URL if it was created
            if (imageSrc) {
                URL.revokeObjectURL(imageSrc);
            }
        };
    }, [src]);

    if (loading) {
        return (
            <div className={`flex items-center justify-center bg-gray-100 ${className}`}>
                <Loader2 className="animate-spin text-gray-400" size={24} />
            </div>
        );
    }

    if (error || !imageSrc) {
        return fallbackIcon ? (
            <div className={`flex items-center justify-center bg-gray-100 ${className}`}>
                <ImageIcon className="text-gray-400" size={32} />
            </div>
        ) : null;
    }

    return <img src={imageSrc} alt={alt} className={className} {...props} />;
}
