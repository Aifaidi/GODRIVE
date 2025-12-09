import { AuthProviderProps } from "react-oidc-context";

export interface OidcConfig {
    authority: string;
    client_id: string;
    redirect_uri: string;
    post_logout_redirect_uri: string;
    response_type: string;
    scope: string;
    clockSkew?: number;
}

export const loadOidcConfig = async (): Promise<AuthProviderProps | null> => {
    try {
        const response = await fetch("/config.json");
        if (!response.ok) {
            throw new Error(`Failed to load config: ${response.statusText}`);
        }
        const config = (await response.json()) as OidcConfig;

        return {
            ...config,
            redirect_uri: window.location.origin,
            post_logout_redirect_uri: window.location.origin,
            onSigninCallback: () => {
                window.history.replaceState({}, document.title, window.location.pathname);
            },
            // Tolerate 5 minutes of clock skew (common in WSL/Docker)
            clockSkew: 300
        } as any;
    } catch (error) {
        console.error("Failed to load OIDC config", error);
        return null;
    }
};
