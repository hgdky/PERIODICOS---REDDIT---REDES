document.addEventListener('DOMContentLoaded', () => {
    const publicHeader = document.getElementById('public-header');
    const publicMain = document.getElementById('public-main');
    const dashboardContainer = document.getElementById('dashboard-container');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const logoutButton = document.getElementById('logout-button');
    const newsListArea = document.getElementById('news-list-area');
    const reportsArea = document.getElementById('reports-area');
    const accountPlansArea = document.getElementById('account-plans-area');
    
    const newsLink = document.getElementById('news-index-link');
    const reportsLink = document.getElementById('reports-link');
    const accountLink = document.getElementById('account-link'); 
    
    const sidebarToggle = document.getElementById('sidebar-toggle'); 
    const fallbackToggle = document.getElementById('menu-fallback-trigger');
    const dashboardWrapper = document.getElementById('dashboard-wrapper'); 
    const currentDateElement = document.getElementById('current-date');
    const authModal = new bootstrap.Modal(document.getElementById('authModal')); 

    let chartInstances = {};
    let pollingInterval; 

    async function loadCharts() {
        try {
            const response = await fetch('/api/stats');
            const data = await response.json();

            document.getElementById('total-news-count').innerText = data.total;

            if (chartInstances['total']) chartInstances['total'].destroy();
            if (chartInstances['source']) chartInstances['source'].destroy();

            const ctx2 = document.getElementById('totalNewsChart').getContext('2d');
            chartInstances['total'] = new Chart(ctx2, {
                type: 'bar',
                data: {
                    labels: ['Progreso'],
                    datasets: [{
                        label: 'Noticias',
                        data: [data.total],
                        backgroundColor: '#198754',
                        barThickness: 50
                    }]
                },
                options: { 
                    indexAxis: 'y', 
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { x: { beginAtZero: true } }
                }
            });

            const ctx3 = document.getElementById('sourcesChart').getContext('2d');
            chartInstances['source'] = new Chart(ctx3, {
                type: 'bar',
                data: {
                    labels: data.sources.labels,
                    datasets: [{
                        label: 'Noticias por Medio',
                        data: data.sources.data,
                        backgroundColor: '#0d6efd'
                    }]
                },
                options: { maintainAspectRatio: false }
            });
        } catch (error) { console.error("Error cargando gráficos", error); }
    }

    function setActiveView(activeArea) {
        if (activeArea !== reportsArea && pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }

        newsListArea.classList.add('d-none');
        reportsArea.classList.add('d-none');
        accountPlansArea.classList.add('d-none'); 

        newsLink.classList.remove('active');
        reportsLink.classList.remove('active');
        accountLink.classList.remove('active');

        activeArea.classList.remove('d-none');

        if (activeArea === reportsArea) {
            reportsLink.classList.add('active');
            loadCharts();
            pollingInterval = setInterval(loadCharts, 10000); 
        } else if (activeArea === newsListArea) {
            newsLink.classList.add('active');
            loadNews();
        } else if (activeArea === accountPlansArea) {
            accountLink.classList.add('active');
        }
    }
    
    newsLink.addEventListener('click', (e) => { e.preventDefault(); setActiveView(newsListArea); });
    reportsLink.addEventListener('click', (e) => { e.preventDefault(); setActiveView(reportsArea); });
    accountLink.addEventListener('click', (e) => { e.preventDefault(); setActiveView(accountPlansArea); });

    async function loadNews() {
        newsListArea.innerHTML = '<div class="text-center mt-5"><div class="spinner-border text-primary"></div><p>Cargando noticias...</p></div>';
        try {
            const response = await fetch('/api/news');
            const newsData = await response.json();
            newsListArea.innerHTML = '';
            if (newsData.length === 0) {
                newsListArea.innerHTML = '<div class="alert alert-warning">Esperando noticias... Ejecuta el scraping.</div>';
                return;
            }
            newsData.forEach(news => {
                const cardHTML = `
                    <div class="card mb-4 shadow-sm">
                        <div class="row g-0">
                            <div class="col-md-4">
                                <img src="${news.image}" class="img-fluid rounded-start h-100" style="object-fit: cover;" alt="img">
                            </div>
                            <div class="col-md-8">
                                <div class="card-body">
                                    <h5 class="card-title text-primary">${news.title}</h5>
                                    <p class="card-text">${news.summary}</p>
                                    <p class="card-text"><small class="text-muted"><strong>${news.author}</strong> | ${news.date} | <a href="${news.url}" target="_blank">Leer más</a></small></p>
                                </div>
                            </div>
                        </div>
                    </div>`;
                newsListArea.innerHTML += cardHTML;
            });
        } catch (error) { newsListArea.innerHTML = '<div class="alert alert-danger">Error al cargar noticias.</div>'; }
    }

    function toggleView(isLoggedIn) {
        if (isLoggedIn) {
            publicHeader.classList.add('d-none');
            publicMain.classList.add('d-none');
            dashboardContainer.classList.remove('d-none');
            const today = new Date();
            if (currentDateElement) currentDateElement.textContent = today.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            setActiveView(newsListArea); 
        } else {
            publicHeader.classList.remove('d-none');
            publicMain.classList.remove('d-none');
            dashboardContainer.classList.add('d-none');
        }
    }
    toggleView(false);

    async function handleAuth(e, endpoint) {
        e.preventDefault();
        const form = e.target;
        try {
            const res = await fetch(endpoint, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ 
                    email: form.querySelector('input[type="email"]').value, 
                    password: form.querySelector('input[type="password"]').value 
                })
            });
            const data = await res.json();
            if (data.success) { authModal.hide(); if (endpoint === '/login') toggleView(true); } 
            else { alert(data.message); }
        } catch (error) { alert('Error servidor'); }
    }
    registerForm.addEventListener('submit', (e) => handleAuth(e, '/register'));
    loginForm.addEventListener('submit', (e) => handleAuth(e, '/login'));
    logoutButton.addEventListener('click', async () => { 
        await fetch('/logout'); 
        if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
        toggleView(false); 
    });

    function toggleSidebarState() {
        dashboardWrapper.classList.toggle('toggled');
        const isToggled = dashboardWrapper.classList.contains('toggled');
        if (isToggled) { sidebarToggle.classList.add('d-none'); fallbackToggle.classList.remove('d-none'); } 
        else { sidebarToggle.classList.remove('d-none'); fallbackToggle.classList.add('d-none'); }
    }
    if (sidebarToggle && fallbackToggle) {
        sidebarToggle.addEventListener('click', toggleSidebarState);
        fallbackToggle.addEventListener('click', toggleSidebarState);
    }
});