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
    const socialNewsArea = document.getElementById('social-news-area');
    
    const newsLink = document.getElementById('news-index-link');
    const reportsLink = document.getElementById('reports-link');
    const accountLink = document.getElementById('account-link'); 
    const aiLink = document.getElementById('ai-link');
    const socialNewsLink = document.getElementById('social-news-link');
    
    const sidebarToggle = document.getElementById('sidebar-toggle'); 
    const fallbackToggle = document.getElementById('menu-fallback-trigger');
    const dashboardWrapper = document.getElementById('dashboard-wrapper'); 
    const currentDateElement = document.getElementById('current-date');
    const authModal = new bootstrap.Modal(document.getElementById('authModal')); 

    let chartInstances = {};
    let pollingInterval;
    let currentPage = 1;

    // --- LÓGICA DE PAGOS Y ACTUALIZACIÓN VISUAL ---
    const paymentModal = new bootstrap.Modal(document.getElementById('paymentModal'));
    const paymentForm = document.getElementById('paymentForm');
    const planNameSpan = document.getElementById('selected-plan-name');
    const planInput = document.getElementById('plan-input');

    const btnStd = document.getElementById('btn-plan-standard');
    const btnVip = document.getElementById('btn-plan-vip');
    const btnPlat = document.getElementById('btn-plan-platinum');

    // Función para actualizar la UI de la cuenta (Persistente)
    function updateAccountUI(plan) {
        // Resetear botones
        if(btnStd) { btnStd.innerText = "Comprar / Downgrade"; btnStd.disabled = false; btnStd.classList.replace('btn-outline-secondary', 'btn-secondary'); }
        if(btnVip) { btnVip.innerText = "Comprar VIP"; btnVip.disabled = false; btnVip.classList.replace('btn-outline-warning', 'btn-warning'); }
        if(btnPlat) { btnPlat.innerText = "Obtener Platinum"; btnPlat.disabled = false; btnPlat.classList.replace('btn-outline-info', 'btn-info'); }

        // Actualizar botón del plan actual
        let targetBtn = null;
        let colorClass = 'bg-primary';
        
        if (plan === 'VIP') { targetBtn = btnVip; colorClass = 'bg-warning text-dark'; }
        if (plan === 'Platinum') { targetBtn = btnPlat; colorClass = 'bg-info text-white'; }
        
        if (targetBtn) {
            targetBtn.innerText = "Plan Actual";
            targetBtn.disabled = true;
            // Cambio de estilo a outline para indicar estado activo
            if(plan === 'VIP') targetBtn.classList.replace('btn-warning', 'btn-outline-warning');
            if(plan === 'Platinum') targetBtn.classList.replace('btn-info', 'btn-outline-info');
        }

        // Actualizar tarjeta en Reportes
        const statusCardTitle = document.querySelector('#reports-area .p-3 h3');
        const statusCardBg = document.querySelector('#reports-area .p-3'); // El div con fondo de color
        if (statusCardTitle) {
            statusCardTitle.innerText = "CUENTA " + plan.toUpperCase();
            statusCardBg.className = `p-3 rounded shadow w-75 ${colorClass}`;
        }
        
        // Guardar en memoria
        localStorage.setItem('userPlan', plan);
    }

    // Cargar plan guardado al iniciar
    const savedPlan = localStorage.getItem('userPlan');
    if (savedPlan && savedPlan !== 'Estándar') {
        updateAccountUI(savedPlan);
    }

    // Listeners de botones de compra
    if(btnVip) btnVip.addEventListener('click', () => openPayModal('VIP'));
    if(btnPlat) btnPlat.addEventListener('click', () => openPayModal('Platinum'));

    function openPayModal(planName) {
        planNameSpan.textContent = planName;
        planInput.value = planName;
        paymentModal.show();
    }

    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = paymentForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = "Procesando...";

        const paymentData = {
            plan: planInput.value,
            nombre: document.getElementById('pay-name').value,
            email: document.getElementById('pay-email').value
        };

        try {
            const response = await fetch('/api/purchase', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(paymentData)
            });
            const result = await response.json();
            
            if (result.success) {
                paymentModal.hide(); 
                paymentForm.reset();
                alert("✅ " + result.message);
                
                // ACTUALIZAR LA INTERFAZ
                updateAccountUI(paymentData.plan);
                
                setActiveView(reportsArea); 
            }
        } catch (error) { alert("Error al procesar el pago."); } 
        finally { submitBtn.disabled = false; submitBtn.textContent = originalText; }
    });

    // --- CHARTJS ---
    async function loadCharts() {
        try {
            const response = await fetch('/api/stats');
            const data = await response.json();
            document.getElementById('total-news-count').innerText = data.total;
            if (chartInstances['total']) chartInstances['total'].destroy();
            if (chartInstances['source']) chartInstances['source'].destroy();
            const ctx2 = document.getElementById('totalNewsChart').getContext('2d');
            chartInstances['total'] = new Chart(ctx2, { type: 'bar', data: { labels: ['Progreso'], datasets: [{ label: 'Noticias', data: [data.total], backgroundColor: '#198754', barThickness: 50 }] }, options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } } });
            const ctx3 = document.getElementById('sourcesChart').getContext('2d');
            chartInstances['source'] = new Chart(ctx3, { type: 'bar', data: { labels: data.sources.labels, datasets: [{ label: 'Noticias por Medio', data: data.sources.data, backgroundColor: '#0d6efd' }] }, options: { maintainAspectRatio: false } });
        } catch (error) { console.error("Error gráficos", error); }
    }

    function loadAICharts() {
        if (chartInstances['aiRadar']) chartInstances['aiRadar'].destroy();
        if (chartInstances['aiSentiment']) chartInstances['aiSentiment'].destroy();
        const ctxRadar = document.getElementById('aiRadarChart').getContext('2d');
        chartInstances['aiRadar'] = new Chart(ctxRadar, { type: 'radar', data: { labels: ['Precision', 'Recall', 'F1-Score', 'AUC-ROC', 'Specificity'], datasets: [{ label: 'Rendimiento', data: [0.92, 0.89, 0.90, 0.95, 0.88], backgroundColor: 'rgba(255, 99, 132, 0.2)', borderColor: 'rgb(255, 99, 132)' }] }, options: { maintainAspectRatio: false, scales: { r: { min: 0, max: 1 } } } });
        const ctxSent = document.getElementById('aiSentimentChart').getContext('2d');
        chartInstances['aiSentiment'] = new Chart(ctxSent, { type: 'doughnut', data: { labels: ['Positivo', 'Neutro', 'Negativo'], datasets: [{ data: [45, 30, 25], backgroundColor: ['#198754', '#ffc107', '#dc3545'] }] }, options: { maintainAspectRatio: false } });
    }

    async function loadSocialNews() {
        const listContainer = document.getElementById('social-content-list');
        listContainer.innerHTML = '<div class="text-center mt-5"><div class="spinner-border text-info"></div><p>Iniciando Robot Dinámico (Brave)...</p></div>';
        try {
            const response = await fetch('/api/social_news');
            const data = await response.json();
            listContainer.innerHTML = '';
            if (data.social_news.length === 0) { listContainer.innerHTML = '<div class="alert alert-warning">No se encontraron posts.</div>'; return; }
            data.social_news.forEach(post => {
                listContainer.innerHTML += `<div class="col-md-6 mb-4"><div class="card h-100 shadow-sm border-info"><div class="card-body"><h5 class="card-title text-info">${post.title}</h5><p class="card-text small">${post.summary || 'Sin resumen.'}</p><p class="card-text"><small class="text-muted"><strong>${post.author}</strong> | ${post.date} | <a href="${post.url}" target="_blank" rel="noopener noreferrer">Ver Post</a></small></p></div></div></div>`;
            });
        } catch (error) { listContainer.innerHTML = '<div class="alert alert-danger">Error de Selenium.</div>'; }
    }

    function setActiveView(activeArea) {
        if (activeArea !== reportsArea && pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
        newsListArea.classList.add('d-none'); reportsArea.classList.add('d-none'); accountPlansArea.classList.add('d-none'); aiMetricsArea.classList.add('d-none'); socialNewsArea.classList.add('d-none');
        newsLink.classList.remove('active'); reportsLink.classList.remove('active'); accountLink.classList.remove('active'); aiLink.classList.remove('active'); socialNewsLink.classList.remove('active');
        activeArea.classList.remove('d-none');
        if (activeArea === reportsArea) { reportsLink.classList.add('active'); loadCharts(); pollingInterval = setInterval(loadCharts, 10000); }
        else if (activeArea === newsListArea) { newsLink.classList.add('active'); loadNews(currentPage); }
        else if (activeArea === accountPlansArea) { accountLink.classList.add('active'); }
        else if (activeArea === aiMetricsArea) { aiLink.classList.add('active'); loadAICharts(); }
        else if (activeArea === socialNewsArea) { socialNewsLink.classList.add('active'); loadSocialNews(); }
    }
    
    newsLink.addEventListener('click', (e) => { e.preventDefault(); setActiveView(newsListArea); });
    reportsLink.addEventListener('click', (e) => { e.preventDefault(); setActiveView(reportsArea); });
    accountLink.addEventListener('click', (e) => { e.preventDefault(); setActiveView(accountPlansArea); });
    aiLink.addEventListener('click', (e) => { e.preventDefault(); setActiveView(aiMetricsArea); });
    socialNewsLink.addEventListener('click', (e) => { e.preventDefault(); setActiveView(socialNewsArea); });

    async function loadNews(page) {
        newsListArea.innerHTML = '<div class="text-center mt-5"><div class="spinner-border text-primary"></div><p>Cargando página ' + page + '...</p></div>';
        try {
            const response = await fetch(`/api/news?page=${page}`);
            const data = await response.json();
            newsListArea.innerHTML = '';
            currentPage = data.current_page;
            const controls = document.createElement('div');
            controls.className = 'd-flex justify-content-between align-items-center mb-3 w-100';
            controls.innerHTML = `<button class="btn btn-outline-primary btn-sm prev-btn" ${!data.has_prev ? 'disabled' : ''}>Anterior</button><span class="text-muted">Pág ${data.current_page} de ${data.pages}</span><button class="btn btn-outline-primary btn-sm next-btn" ${!data.has_next ? 'disabled' : ''}>Siguiente</button>`;
            newsListArea.insertAdjacentHTML('beforeend', controls.outerHTML);
            data.news.forEach(news => {
                let badgeClass = news.sentiment === 'Positivo' ? 'bg-success' : news.sentiment === 'Negativo' ? 'bg-danger' : 'bg-secondary';
                newsListArea.innerHTML += `<div class="card mb-3 shadow-sm"><div class="row g-0"><div class="col-md-3"><img src="${news.image}" class="img-fluid rounded-start h-100 w-100" style="object-fit: cover;"></div><div class="col-md-9"><div class="card-body"><div class="d-flex justify-content-between"><h5 class="card-title text-primary mb-1">${news.title}</h5><span class="badge ${badgeClass} align-self-start">IA: ${news.sentiment}</span></div><p class="card-text mb-1">${news.summary}</p><p class="card-text"><small class="text-muted"><strong>${news.author}</strong> | ${news.date} | <a href="${news.url}" target="_blank">Leer</a></small></p></div></div></div></div>`;
            });
            newsListArea.insertAdjacentHTML('beforeend', controls.outerHTML);
        } catch (error) { newsListArea.innerHTML = '<div class="alert alert-danger">Error.</div>'; }
    }
    
    newsListArea.addEventListener('click', function(e) {
        if (e.target.classList.contains('prev-btn')) loadNews(currentPage - 1);
        if (e.target.classList.contains('next-btn')) loadNews(currentPage + 1);
    });

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
            const res = await fetch(endpoint, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ email: form.querySelector('input[type="email"]').value, password: form.querySelector('input[type="password"]').value }) });
            const data = await res.json();
            if (data.success) { 
                authModal.hide(); 
                alert(data.message); 
                if (endpoint === '/login') toggleView(true); 
            } else { alert(data.message); }
        } catch (error) { alert('Error servidor'); }
    }
    registerForm.addEventListener('submit', (e) => handleAuth(e, '/register'));
    loginForm.addEventListener('submit', (e) => handleAuth(e, '/login'));
    logoutButton.addEventListener('click', async () => { 
        await fetch('/logout'); 
        if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
        // Resetear plan local al salir
        localStorage.removeItem('userPlan');
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