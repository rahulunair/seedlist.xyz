let startups = [];
let currentFilter = 'all';
let searchTerm = '';
let currentSort = 'name';

// Add multiple filter support
let activeFilters = new Set(['all']);

const ITEMS_PER_PAGE = 12;
let currentPage = 1;

let loadingMore = false;
let observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && !loadingMore) {
            loadMore();
        }
    });
}, { 
    threshold: 0.1,
    rootMargin: '100px' // Load more before reaching the bottom
});

let currentSentinel = null;

async function loadStartups() {
    try {
        const response = await fetch('data/seeds.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        if (!data || !Array.isArray(data) || data.length === 0) {
            throw new Error('No startup data available');
        }
        
        startups = data;
        populateFilters();
        renderStartups();
    } catch (error) {
        console.error('Error loading startups:', error);
        document.getElementById('startup-grid').innerHTML = `
            <div class="alert alert-error">
                Failed to load startups: ${error.message}
            </div>
        `;
    }
}

function populateFilters() {
    const filtersContainer = document.getElementById('filters');
    const sectors = new Set(); 
    
    startups.forEach(startup => {
        startup.category.split(',')
            .map(s => s.trim())
            .filter(s => s)
            .forEach(sector => sectors.add(sector));
    });

    const sortedSectors = Array.from(sectors).sort();
    filtersContainer.innerHTML = `
        <button class="btn btn-primary" data-filter="all">ALL</button>
        ${sortedSectors.map(sector => 
            `<button class="btn btn-outline" data-filter="${sector}">${sector}</button>`
        ).join('')}
    `;

    filtersContainer.addEventListener('click', (e) => {
        if (e.target.hasAttribute('data-filter')) {
            const newFilter = e.target.getAttribute('data-filter');
            currentFilter = newFilter;
            currentPage = 1;
            
            filtersContainer.querySelectorAll('.btn').forEach(btn => {
                const isActive = btn.getAttribute('data-filter') === currentFilter;
                btn.classList.toggle('btn-outline', !isActive);
                btn.classList.toggle('btn-primary', isActive);
            });
            
            renderStartups();
            updateURLState();
        }
    });
}

// Separate favicon loading function - simplified and more reliable
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

// Separate function to create base card
function createBaseCard(startup, template) {
    const card = template.content.cloneNode(true);
    const cardLink = card.querySelector('a');
    const companyName = startup.companyName || 'Unknown Company';
    cardLink.href = `startup.html?id=${encodeURIComponent(companyName)}`;
    
    const figure = card.querySelector('figure');
    const bgColor = stringToColor(companyName);
    const initials = getCompanyInitials(companyName);
    
    figure.innerHTML = `
        <div class="w-full h-48 flex items-center justify-center" 
             style="background: linear-gradient(135deg, ${bgColor}33, ${bgColor}66)">
            <div class="text-center">
                <div class="text-3xl font-bold">
                    ${initials}
                </div>
                <div class="favicon-container"></div>
            </div>
        </div>
    `;
    
    card.querySelector('.card-title').textContent = companyName;
    card.querySelector('p').textContent = startup.summary || 'No summary available.';
    
    // Add sectors
    const sectorsContainer = card.querySelector('.sectors');
    if (startup.category) {
        startup.category.split(',').map(s => s.trim()).forEach(sector => {
            const badge = document.createElement('span');
            badge.className = 'badge badge-outline';
            badge.textContent = sector;
            sectorsContainer.appendChild(badge);
        });
    }

    // Handle website button
    const websiteBtn = card.querySelector('.website-btn');
    if (startup.websiteUrl) {
        websiteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.open(startup.websiteUrl, '_blank');
        });
    } else {
        websiteBtn.style.display = 'none';
    }

    return card;
}

// Modified renderCard function with debugging
async function renderCard(startup, template) {
    try {
        const card = createBaseCard(startup, template);
        
        if (startup.websiteUrl) {
            try {
                const domain = new URL(startup.websiteUrl).hostname;
                const favicon = await loadFavicon(domain);
                
                if (favicon) {
                    const faviconContainer = card.querySelector('.favicon-container');
                    if (faviconContainer) {
                        faviconContainer.innerHTML = `
                            <img src="${favicon}" 
                                 alt=""
                                 class="w-8 h-8 object-contain mx-auto mt-2 opacity-0 transition-opacity duration-300"
                                 onload="this.classList.add('opacity-100')" />
                        `;
                    }
                }
            } catch (error) {
                // Silently continue without favicon
            }
        }
        
        return card;
    } catch (error) {
        console.error(`Failed to render card for: ${startup.companyName}`, error);
        return null;
    }
}

// Modified renderStartups function with debugging
async function renderStartups(append = false) {
    const grid = document.getElementById('startup-grid');
    const template = document.getElementById('startup-card-template');
    
    try {
        const filteredStartups = startups.filter(filterStartups);

        if (!append) {
            grid.innerHTML = '';
            currentPage = 1;
        }

        if (filteredStartups.length === 0) {
            grid.innerHTML = '<div class="alert alert-info">No startups match your criteria.</div>';
            return;
        }

        // Calculate start and end indices
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredStartups.length);
        
        // Get startups for current page
        const paginatedStartups = filteredStartups
            .sort(sortStartups)
            .slice(startIndex, endIndex);

        // Render cards
        for (const startup of paginatedStartups) {
            const card = await renderCard(startup, template);
            if (card) {
                grid.appendChild(card);
            }
        }

        // Add sentinel if there are more items
        if (endIndex < filteredStartups.length) {
            if (currentSentinel) {
                observer.unobserve(currentSentinel);
                currentSentinel.remove();
            }
            
            // Create new sentinel
            const sentinel = document.createElement('div');
            sentinel.className = 'col-span-full h-4'; // Make sentinel span full width
            grid.appendChild(sentinel);
            currentSentinel = sentinel;
            observer.observe(sentinel);
        } else if (currentSentinel) {
            // Remove sentinel if we're at the end
            observer.unobserve(currentSentinel);
            currentSentinel.remove();
            currentSentinel = null;
        }

    } catch (error) {
        console.error('Error rendering startups:', error);
        grid.innerHTML = '<div class="alert alert-error">Error rendering startups.</div>';
    }
}

function formatFunding(amount) {
    if (!amount) return 'Undisclosed';
    if (amount >= 1000000) {
        return `$${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
        return `$${(amount / 1000).toFixed(1)}K`;
    }
    return `$${amount}`;
}

function initializeTheme() {
    // Check for saved theme preference, otherwise use system preference
    const savedTheme = localStorage.getItem('theme') || 
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    // Set the checkbox state based on theme
    const themeController = document.querySelector('.theme-controller');
    themeController.checked = savedTheme === 'light';
    
    // Add event listener for theme toggle
    themeController.addEventListener('change', (e) => {
        const newTheme = e.target.checked ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });
}

function handleSearch(e) {
    debouncedSearch(e.target.value.toLowerCase());
}

function filterStartups(startup) {
    // Debug log for filtering
    console.log('Filtering startup:', {
        name: startup.companyName,
        category: startup.category,
        currentFilter: currentFilter,
        searchTerm: searchTerm
    });

    if (searchTerm && !startup.companyName.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !startup.summary.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
    }
    
    if (currentFilter !== 'all') {
        const categories = startup.category.split(',').map(cat => cat.trim());
        const matches = categories.some(cat => cat === currentFilter);
        
        // Debug log for category matching
        console.log('Category check:', {
            startup: startup.companyName,
            categories: categories,
            currentFilter: currentFilter,
            matches: matches
        });
        
        return matches;
    }
    
    return true;
}

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

function sortStartups(a, b) {
    switch (currentSort) {
        case 'name':
            return a.companyName.localeCompare(b.companyName);
        case 'funding':
            return (b.funding || 0) - (a.funding || 0);
        case 'recent':
            return (b.funding || 0) - (a.funding || 0);
        default:
            return 0;
    }
}

// Debounce search input
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const debouncedSearch = debounce((value) => {
    searchTerm = value;
    renderStartups();
}, 300);

function updateURLState() {
    const params = new URLSearchParams();
    if (currentFilter !== 'all') params.set('filter', currentFilter);
    if (searchTerm) params.set('q', searchTerm);
    if (currentSort !== 'name') params.set('sort', currentSort);
    
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
}

async function loadMore() {
    if (loadingMore) return;
    loadingMore = true;
    
    try {
        const filteredStartups = startups.filter(filterStartups);
        const totalPages = Math.ceil(filteredStartups.length / ITEMS_PER_PAGE);
        
        if (currentPage < totalPages) {
            currentPage++;
            await renderStartups(true);
        }
    } catch (error) {
        console.error('Error loading more startups:', error);
    } finally {
        loadingMore = false;
    }
}

// Load data when page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    loadStartups();
    document.getElementById('search').addEventListener('input', handleSearch);
    document.getElementById('sort').addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderStartups();
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === '/') {
        e.preventDefault();
        document.getElementById('search').focus();
    }
}); 