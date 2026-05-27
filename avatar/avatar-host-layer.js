export const createAvatarHostRoot = () => {
    let hostRoot = document.getElementById('avatar-host-root');
    if (hostRoot) return hostRoot;

    hostRoot = document.createElement('div');
    hostRoot.id = 'avatar-host-root';
    hostRoot.style.position = 'fixed';
    hostRoot.style.left = '-20000px';
    hostRoot.style.top = '-20000px';
    hostRoot.style.width = '0';
    hostRoot.style.height = '0';
    hostRoot.style.opacity = '0';
    hostRoot.style.pointerEvents = 'none';
    hostRoot.style.overflow = 'hidden';
    document.body.appendChild(hostRoot);
    return hostRoot;
};

export const createAvatarHost = (hostRoot, profile) => {
    const host = document.createElement('div');
    host.className = 'avatar-render-host';
    host.style.position = 'absolute';
    host.style.left = '0';
    host.style.top = '0';
    host.style.width = `${profile.hostSize.width}px`;
    host.style.height = `${profile.hostSize.height}px`;
    host.style.overflow = 'hidden';
    hostRoot.appendChild(host);
    return host;
};
