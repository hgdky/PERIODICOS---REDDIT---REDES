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
    const aiMetricsArea = document.getElementById('ai-metrics-area');
    
    const newsLink = document.getElementById('news-index-link');
    const reportsLink = document.getElementById('reports-link');
    const accountLink = document.getElementById('account-link'); 
    const aiLink = document.getElementById('ai-link');
    
    const sidebarToggle = document.getElementById('sidebar-toggle'); 
    const fallbackToggle = document.getElementById('menu-fallback-trigger');
    const dashboardWrapper = document.getElementById('dashboard-wrapper'); 
    const currentDateElement = document.getElementById('current-date');
    const authModal = new bootstrap.Modal(document.getElementById('authModal')); 

    let chartInstances = {};
    let pollingInterval;
    let currentPage = 1; // Variable para controlar la página actual

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
                data: { labels: ['Progreso'], datasets: [{ label: 'Noticias', data: [data.total], backgroundColor: '#198754', barThickness: 50 }] },
                options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
            });

            const ctx3 = document.getElementById('sourcesChart').getContext('2d');
            chartInstances['source'] = new Chart(ctx3, {
                type: 'bar',
                data: { labels: data.sources.labels, datasets: [{ label: 'Noticias por Medio', data: data.sources.data, backgroundColor: '#0d6efd' }] },
                options: { maintainAspectRatio: false }
            });
        } catch (error) { console.error("Error cargando gráficos", error); }
    }

    function loadAICharts() {
        if (chartInstances['aiRadar']) chartInstances['aiRadar'].destroy();
        if (chartInstances['aiSentiment']) chartInstances['aiSentiment'].destroy();

        const ctxRadar = document.getElementById('aiRadarChart').getContext('2d');
        chartInstances['aiRadar'] = new Chart(ctxRadar, {
            type: 'radar',
            data: {
                labels: ['Precision', 'Recall', 'F1-Score', 'AUC-ROC', 'Specificity'],
                datasets: [{
                    label: 'Rendimiento Modelo',
                    data: [0.92, 0.89, 0.90, 0.95, 0.88],
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderColor: 'rgb(255, 99, 132)',
                    pointBackgroundColor: 'rgb(255, 99, 132)',
                }]
            },
            options: { maintainAspectRatio: false, scales: { r: { min: 0, max: 1 } } }
        });

        const ctxSent = document.getElementById('aiSentimentChart').getContext('2d');
        chartInstances['aiSentiment'] = new Chart(ctxSent, {
            type: 'doughnut',
            data: { labels: ['Positivo', 'Neutro', 'Negativo'], datasets: [{ data: [45, 30, 25], backgroundColor: ['#198754', '#ffc107', '#dc3545'] }] },
            options: { maintainAspectRatio: false }
        });
    }

    function setActiveView(activeArea) {
        if (activeArea !== reportsArea && pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
        newsListArea.classList.add('d-none'); reportsArea.classList.add('d-none'); accountPlansArea.classList.add('d-none'); aiMetricsArea.classList.add('d-none');
        newsLink.classList.remove('active'); reportsLink.classList.remove('active'); accountLink.classList.remove('active'); aiLink.classList.remove('active');
        activeArea.classList.remove('d-none');

        if (activeArea === reportsArea) {
            reportsLink.classList.add('active'); loadCharts(); pollingInterval = setInterval(loadCharts, 10000); 
        } else if (activeArea === newsListArea) {
            newsLink.classList.add('active'); loadNews(currentPage);
        } else if (activeArea === accountPlansArea) { accountLink.classList.add('active');
        } else if (activeArea === aiMetricsArea) { aiLink.classList.add('active'); loadAICharts(); }
    }
    
    newsLink.addEventListener('click', (e) => { e.preventDefault(); setActiveView(newsListArea); });
    reportsLink.addEventListener('click', (e) => { e.preventDefault(); setActiveView(reportsArea); });
    accountLink.addEventListener('click', (e) => { e.preventDefault(); setActiveView(accountPlansArea); });
    aiLink.addEventListener('click', (e) => { e.preventDefault(); setActiveView(aiMetricsArea); });

    // --- CARGA DE NOTICIAS CON PAGINACIÓN Y AI TAGS ---
    async function loadNews(page) {
        newsListArea.innerHTML = '<div class="text-center mt-5"><div class="spinner-border text-primary"></div><p>Cargando página ' + page + '...</p></div>';
        try {
            const response = await fetch(`/api/news?page=${page}`);
            const data = await response.json();
            
            newsListArea.innerHTML = '';
            
            // Controles de Paginación (Arriba)
            const controls = document.createElement('div');
            controls.className = 'd-flex justify-content-between align-items-center mb-3';
            controls.innerHTML = `
                <button class="btn btn-outline-primary btn-sm" ${!data.has_prev ? 'disabled' : ''} id="prev-btn">Anterior</button>
                <span class="text-muted">Página ${data.current_page} de ${data.pages}</span>
                <button class="btn btn-outline-primary btn-sm" ${!data.has_next ? 'disabled' : ''} id="next-btn">Siguiente</button>
            `;
            newsListArea.appendChild(controls);

            // Eventos de botones
            document.getElementById('prev-btn')?.addEventListener('click', () => { currentPage--; loadNews(currentPage); });
            document.getElementById('next-btn')?.addEventListener('click', () => { currentPage++; loadNews(currentPage); });

            if (data.news.length === 0) {
                newsListArea.innerHTML += '<div class="alert alert-warning">No hay noticias.</div>';
                return;
            }

            data.news.forEach(news => {
                // Etiqueta de Sentimiento (NLP)
                let badgeClass = 'bg-secondary';
                if(news.sentiment === 'Positivo') badgeClass = 'bg-success';
                if(news.sentiment === 'Negativo') badgeClass = 'bg-danger';

                const cardHTML = `
                    <div class="card mb-3 shadow-sm">
                        <div class="row g-0">
                            <div class="col-md-3">
                                <img src="${news.image}" class="img-fluid rounded-start h-100 w-100" style="object-fit: cover;" alt="img">
                            </div>
                            <div class="col-md-9">
                                <div class="card-body">
                                    <div class="d-flex justify-content-between">
                                        <h5 class="card-title text-primary mb-1">${news.title}</h5>
                                        <span class="badge ${badgeClass} align-self-start">IA: ${news.sentiment}</span>
                                    </div>
                                    <p class="card-text mb-1">${news.summary}</p>
                                    <p class="card-text"><small class="text-muted"><strong>${news.author}</strong> | ${news.date} | <a href="${news.url}" target="_blank">Leer</a></small></p>
                                </div>
                            </div>
                        </div>
                    </div>`;
                newsListArea.innerHTML += cardHTML;
            });
            
            // Clonar controles abajo también
            newsListArea.appendChild(controls.cloneNode(true));
            // Re-asignar eventos a los botones de abajo
            const btns = newsListArea.querySelectorAll('button');
            btns[btns.length-2].addEventListener('click', () => { currentPage--; loadNews(currentPage); }); // Prev
            btns[btns.length-1].addEventListener('click', () => { currentPage++; loadNews(currentPage); }); // Next

        } catch (error) { newsListArea.innerHTML = '<div class="alert alert-danger">Error al cargar noticias.</div>'; }
    }

    function toggleView(isLoggedIn) {
        if (isLoggedIn) {
            publicHeader.classList.add('d-none'); publicMain.classList.add('d-none'); dashboardContainer.classList.remove('d-none');
            const today = new Date();
            if (currentDateElement) currentDateElement.textContent = today.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            setActiveView(newsListArea); 
        } else {
            publicHeader.classList.remove('d-none'); publicMain.classList.remove('d-none'); dashboardContainer.classList.add('d-none');
        }
    }
    toggleView(false);

    async function handleAuth(e, endpoint) {
        e.preventDefault();
        const form = e.target;
        try {
            const res = await fetch(endpoint, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email: form.querySelector('input[type="email"]').value, password: form.querySelector('input[type="password"]').value })
            });
            const data = await res.json();
            if (data.success) { authModal.hide(); if (endpoint === '/login') toggleView(true); } else { alert(data.message); }
        } catch (error) { alert('Error servidor'); }
    }
    registerForm.addEventListener('submit', (e) => handleAuth(e, '/register'));
    loginForm.addEventListener('submit', (e) => handleAuth(e, '/login'));
    logoutButton.addEventListener('click', async () => { await fetch('/logout'); if (pollingInterval) clearInterval(pollingInterval); toggleView(false); });

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