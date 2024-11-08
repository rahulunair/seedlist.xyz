function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
}

function getCompanyInitials(name) {
    return name
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

function loadFavicon(domain) {
    return new Promise((resolve, reject) => {
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
        const img = new Image();
        
        const timeoutId = setTimeout(() => {
            reject(new Error('Favicon loading timed out'));
        }, 1000);

        img.onload = () => {
            clearTimeout(timeoutId);
            resolve(faviconUrl);
        };
        
        img.onerror = () => {
            clearTimeout(timeoutId);
            reject(new Error('Favicon failed to load'));
        };

        img.src = faviconUrl;
    });
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    const themeController = document.querySelector('.theme-controller');
    themeController.checked = savedTheme === 'light';
    
    themeController.addEventListener('change', (e) => {
        const newTheme = e.target.checked ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });
}

function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('error').classList.add('hidden');
    document.getElementById('startup-details').classList.add('hidden');
}

function showError(message) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.remove('hidden');
    document.getElementById('startup-details').classList.add('hidden');
    document.getElementById('error-message').textContent = message;
}

function showContent() {
    const container = document.getElementById('startup-details');
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.add('hidden');
    container.classList.remove('hidden');
    
    // Force a reflow to ensure animations work
    void container.offsetHeight;
    container.style.opacity = '1';
}

async function loadStartupDetails() {
    showLoading();
    
    const urlParams = new URLSearchParams(window.location.search);
    const startupId = decodeURIComponent(urlParams.get('id'));
    
    console.log('Loading details for:', startupId);
    
    if (!startupId) {
        showError('No startup ID provided');
        return;
    }

    try {
        const response = await fetch('data/seeds.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const startups = await response.json();
        console.log('Loaded startups:', startups);
        
        const startup = startups.find(s => 
            s.companyName === startupId || 
            s.companyName.toLowerCase() === startupId.toLowerCase()
        );
        
        console.log('Found startup:', startup);
        
        if (!startup) {
            showError(`Startup not found: ${startupId}`);
            return;
        }
        
        if (!startup.companyName || !startup.category) {
            showError('Invalid startup data: missing required fields');
            return;
        }
        
        await renderStartupDetails(startup);
        showContent();
    } catch (error) {
        console.error('Error loading startup details:', error);
        showError(`Failed to load startup details: ${error.message}`);
    }
}

function safeText(text) {
    return text || '';
}

async function renderStartupDetails(startup) {
    try {
        const bgColor = stringToColor(startup.companyName || '');
        const initials = getCompanyInitials(startup.companyName || '');
        
        let faviconHtml = '';
        if (startup.websiteUrl) {
            try {
                const domain = new URL(startup.websiteUrl).hostname;
                const favicon = await loadFavicon(domain);
                faviconHtml = favicon ? `
                    <div class="absolute bottom-2 right-2 bg-base-100 rounded-full p-1 shadow-lg">
                        <img src="${favicon}" alt="" class="w-6 h-6"/>
                    </div>` : '';
            } catch (error) {
                console.warn('Favicon load failed:', error);
            }
        }

        const categoryBadges = startup.category 
            ? startup.category.split(',')
                .map(cat => `<span class="badge badge-outline badge-sm">${cat.trim()}</span>`)
                .join('')
            : '';

        const html = `
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 p-4">
                <!-- Left Column -->
                <div class="md:col-span-1">
                    <div class="card bg-base-100 shadow-xl">
                        <a href="${startup.websiteUrl}" target="_blank" class="cursor-pointer">
                            <div class="relative">
                                <div class="aspect-square w-full flex items-center justify-center profile-image hover:opacity-90 transition-opacity"
                                     style="background: linear-gradient(135deg, ${bgColor}33, ${bgColor}66)">
                                    <div class="text-center">
                                        <div class="text-5xl font-bold">${initials}</div>
                                        ${faviconHtml}
                                    </div>
                                </div>
                            </div>
                        </a>
                        <div class="card-body p-3">
                            <h2 class="card-title justify-center text-xl mb-2">${safeText(startup.companyName)}</h2>
                            <div class="flex flex-wrap gap-1 justify-center">
                                ${categoryBadges}
                            </div>
                            <div class="stats stats-vertical shadow mt-2 bg-base-200">
                                <div class="stat py-1">
                                    <div class="stat-title text-xs">Stage</div>
                                    <div class="stat-value text-base">${safeText(startup.investmentStage) || 'N/A'}</div>
                                </div>
                                <div class="stat py-1">
                                    <div class="stat-title text-xs">Funding</div>
                                    <div class="stat-value text-base">${startup.funding ? `$${(startup.funding / 1000000).toFixed(1)}M` : 'N/A'}</div>
                                </div>
                            </div>
                            ${startup.websiteUrl ? `
                                <a href="${startup.websiteUrl}" target="_blank" 
                                   class="btn btn-primary btn-sm mt-2">Visit Website</a>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <!-- Right Column -->
                <div class="md:col-span-3">
                    <div class="card bg-base-100 shadow-xl">
                        <div class="card-body p-4 space-y-4">
                            <div>
                                <h3 class="text-lg font-bold mb-1">About</h3>
                                <p class="text-sm">${safeText(startup.summary) || 'No information available.'}</p>
                            </div>
                            
                            <div>
                                <h3 class="text-lg font-bold mb-1">Technology Stack</h3>
                                <p class="text-sm">${safeText(startup.technicalApproach) || 'No technical details available.'}</p>
                            </div>
                            
                            <div>
                                <h3 class="text-lg font-bold mb-1">Market Overview</h3>
                                <p class="text-sm">${safeText(startup.marketOverview) || 'No market details available.'}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const container = document.getElementById('startup-details');
        container.innerHTML = html;
        showContent();
    } catch (error) {
        console.error('Error in renderStartupDetails:', error);
        showError(`Failed to render startup details: ${error.message}`);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    loadStartupDetails();
}); 