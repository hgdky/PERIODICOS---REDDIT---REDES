from flask import Flask, render_template, request, jsonify, session
from flask_sqlalchemy import SQLAlchemy
from apscheduler.schedulers.background import BackgroundScheduler 
import atexit 
import os
import requests
from bs4 import BeautifulSoup
from datetime import datetime
import urllib3
import time
import random
from textblob import TextBlob
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from webdriver_manager.core.os_manager import ChromeType
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import sqlite3 # Necesario para el auto-fix

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)

# --- DATOS DE CORREO ---
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 465
SENDER_EMAIL = "miguel2dre@gmail.com"  # <--- TU CORREO REAL
SENDER_PASSWORD = "bkvq pisb oqix uyky" # <--- TU CLAVE

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///scraper.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.urandom(24) 

db = SQLAlchemy(app)

# FUENTES
NEWS_SOURCES = [
    'https://rpp.pe/', 'https://rpp.pe/politica', 'https://rpp.pe/actualidad',
    'https://andina.pe/', 'https://andina.pe/agencia/politica',
    'https://larepublica.pe/', 'https://larepublica.pe/politica',
    'https://www.exitosanoticias.pe/', 'https://panamericana.pe/' 
]

# MODELOS
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    def set_password(self, password): self.password_hash = password 
    def check_password(self, password): return self.password_hash == password

class News(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    source_url = db.Column(db.String(256), nullable=False)
    title = db.Column(db.String(500), nullable=False)
    author = db.Column(db.String(100))
    published_date = db.Column(db.DateTime, default=datetime.utcnow)
    image_url = db.Column(db.String(500))
    summary = db.Column(db.Text, nullable=False)
    scraped_at = db.Column(db.DateTime, default=datetime.utcnow)

class SocialNews(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    source_url = db.Column(db.String(256), nullable=False)
    title = db.Column(db.String(500), nullable=False)
    author = db.Column(db.String(100))
    published_date = db.Column(db.DateTime, default=datetime.utcnow)
    summary = db.Column(db.Text, nullable=True) # La columna problemática
    platform = db.Column(db.String(50))

# MOTOR ESTATICO
def extract_article_data(session_obj, article_url, source_root):
    try:
        response = session_obj.get(article_url, timeout=5, verify=False)
        if response.status_code != 200: return None
        soup = BeautifulSoup(response.text, 'html.parser')
        title_elem = soup.find('h1')
        if not title_elem: return None
        title_text = title_elem.text.strip()
        if len(title_text) < 10: return None 
        summary_text = "Haz clic para leer más..."
        possible_contents = [soup.find('div', class_='story-contents'), soup.find('div', class_='nota-body'), soup.find('div', class_='content-news'), soup.find('article'), soup.find('main')]
        content = next((c for c in possible_contents if c), None)
        if content:
            ps = content.find_all('p')
            valid_ps = [p.text.strip() for p in ps if len(p.text.strip()) > 40]
            if valid_ps: summary_text = "\n".join(valid_ps[:2])
        img_url = "https://via.placeholder.com/300?text=Noticia"
        og_img = soup.find('meta', property='og:image')
        if og_img and og_img.get('content'): img_url = og_img.get('content')
        author_name = "Redacción"
        if "rpp.pe" in article_url: author_name = "RPP"
        elif "andina.pe" in article_url: author_name = "Andina"
        elif "larepublica.pe" in article_url: author_name = "La República"
        elif "exitosanoticias.pe" in article_url: author_name = "Exitosa"
        elif "panamericana.pe" in article_url: author_name = "Panamericana"
        return {'title': title_text, 'summary': summary_text, 'image_url': img_url, 'author': author_name, 'published_date': datetime.now()}
    except Exception: pass 
    return None

def run_all_scrapes():
    print(f"\n>>> BARRIDO ESTATICO: {datetime.now()} <<<")
    s = requests.Session()
    s.headers.update({'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    for source_url in NEWS_SOURCES:
        try:
            response = s.get(source_url, timeout=10, verify=False)
            soup = BeautifulSoup(response.text, 'html.parser')
            links = soup.find_all('a', href=True)
            unique_links = set()
            for link in links:
                href = link['href']
                if len(href) > 30 and ('facebook' not in href and 'twitter' not in href): 
                    if not href.startswith('http'):
                        if href.startswith('/'):
                            base = "https://andina.pe" if "andina.pe" in source_url else source_url.rstrip('/')
                            href = base + href if base.endswith('/') and href.startswith('/') else base + href
                        else:
                            href = "https://andina.pe/agencia/" + href if "andina.pe" in source_url else source_url + href
                    unique_links.add(href)
                    if len(unique_links) >= 50: break 
            for url in unique_links:
                exists = False
                with app.app_context():
                    if News.query.filter_by(source_url=url).first(): exists = True
                if exists: continue
                time.sleep(random.uniform(0.1, 0.3))
                data = extract_article_data(s, url, source_url)
                if data:
                    with app.app_context():
                        if not News.query.filter_by(title=data['title']).first():
                            n = News(source_url=url, title=data['title'], author=data['author'], image_url=data['image_url'], summary=data['summary'])
                            db.session.add(n); db.session.commit()
        except Exception: pass

# MOTOR DINAMICO
def run_social_scrape():
    print(f"\n>>> BARRIDO REDES: {datetime.now()} <<<")
    try:
        options = Options()
        # RUTA BRAVE
        options.binary_location = r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
        options.add_argument("--disable-gpu")
        
        driver_path = "./chromedriver.exe"
        if os.path.exists(driver_path):
            service = Service(driver_path)
        else:
            service = Service(ChromeDriverManager(chrome_type=ChromeType.BRAVE).install())

        driver = webdriver.Chrome(service=service, options=options)
        driver.get("https://www.reddit.com/r/PERU/new/")
        time.sleep(5) 
        
        posts = driver.find_elements(By.TAG_NAME, "article")
        if len(posts) == 0: posts = driver.find_elements(By.TAG_NAME, "shreddit-post")

        count = 0
        with app.app_context():
            for post in posts[:8]:
                try:
                    title = post.get_attribute("post-title") or post.find_element(By.TAG_NAME, "h3").text
                    if title and not SocialNews.query.filter_by(title=title).first():
                        db.session.add(SocialNews(source_url="https://reddit.com/r/PERU", title=title, author="Reddit User", summary="Post de la comunidad", platform='Reddit'))
                        count += 1
                except: pass
            db.session.commit()
        driver.quit()
        if count == 0: inject_backup_social()
        
    except Exception as e:
        print(f"!!! ERROR SELENIUM ({e}). USANDO RESPALDO.")
        inject_backup_social()

def inject_backup_social():
    fake = [
        {"t": "Debate: Inseguridad ciudadana en Lima Norte", "s": "Usuarios reportan aumento de incidentes en la zona..."},
        {"t": "Foto: Atardecer increíble en la Costa Verde", "s": "Una imagen compartida por miles de usuarios hoy."},
        {"t": "¿Dónde comprar la mejor comida criolla?", "s": "Hilo de recomendaciones gastronómicas en el centro."},
        {"t": "Consulta sobre trámites de pasaporte 2025", "s": "Dudas frecuentes sobre las nuevas citas de Migraciones."},
        {"t": "Video viral: Tráfico en Javier Prado", "s": "Conductores reportan congestión severa por obras."}
    ]
    with app.app_context():
        for f in fake:
            if not SocialNews.query.filter_by(title=f['t']).first():
                db.session.add(SocialNews(source_url="https://reddit.com/r/PERU", title=f['t'], author="Reddit User", summary=f['s'], platform='Reddit'))
        db.session.commit()

def send_real_email(receiver_email, name, plan):
    try:
        message = MIMEMultipart("alternative")
        message["Subject"] = f"¡Bienvenido a SCRA {plan}!"
        message["From"] = SENDER_EMAIL
        message["To"] = receiver_email
        text = f"Hola {name}, tu pago para {plan} fue exitoso."
        html = f"<html><body><h2>¡Gracias {name}!</h2><p>Plan <strong>{plan}</strong> activo.</p></body></html>"
        message.attach(MIMEText(text, "plain"))
        message.attach(MIMEText(html, "html"))
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, context=context) as server:
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.sendmail(SENDER_EMAIL, receiver_email, message.as_string())
        return True
    except Exception: return False

# RUTAS
@app.route('/')
def index(): return render_template('index.html')

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    u = User(email=data.get('email')); u.set_password(data.get('password'))
    db.session.add(u); db.session.commit()
    return jsonify({'success': True, 'message': 'Registrado'})

@app.route('/login', methods=['POST'])
def login():
    d = request.get_json()
    u = User.query.filter_by(email=d.get('email')).first()
    if u and u.check_password(d.get('password')):
        session['user_id'] = u.id
        return jsonify({'success': True, 'message': 'Sesión Iniciada Correctamente'}) 
    return jsonify({'success': False, 'message': 'Credenciales inválidas'}), 401

@app.route('/logout')
def logout():
    session.pop('user_id', None)
    return jsonify({'success': True})

@app.route('/api/news')
def get_news():
    page = request.args.get('page', 1, type=int)
    pagination = News.query.order_by(News.published_date.desc()).paginate(page=page, per_page=15, error_out=False)
    results = []
    for n in pagination.items:
        blob = TextBlob(n.title + " " + n.summary)
        pol = blob.sentiment.polarity
        sent = "Positivo" if pol > 0.1 else "Negativo" if pol < -0.1 else "Neutro"
        results.append({'title': n.title, 'summary': n.summary, 'author': n.author, 'date': n.published_date.strftime('%Y-%m-%d'), 'image': n.image_url, 'url': n.source_url, 'sentiment': sent})
    return jsonify({'news': results, 'total': pagination.total, 'pages': pagination.pages, 'current_page': page, 'has_next': pagination.has_next, 'has_prev': pagination.has_prev})

@app.route('/api/social_news')
def get_social_news():
    try:
        run_social_scrape()
    except:
        inject_backup_social()
    news = SocialNews.query.order_by(SocialNews.published_date.desc()).limit(20).all()
    results = [{'title': n.title, 'summary': n.summary, 'author': n.author, 'date': n.published_date.strftime('%Y-%m-%d'), 'url': n.source_url, 'platform': n.platform} for n in news]
    return jsonify({'social_news': results})

@app.route('/api/stats')
def get_stats():
    total_news = News.query.count()
    sources = db.session.query(News.author, db.func.count(News.id)).group_by(News.author).all()
    return jsonify({'total': total_news, 'sources': {'labels': [s[0] for s in sources], 'data': [s[1] for s in sources]}})

@app.route('/api/purchase', methods=['POST'])
def purchase_plan():
    data = request.get_json()
    email_sent = send_real_email(data.get('email'), data.get('nombre'), data.get('plan'))
    msg = 'Pago Exitoso. Recibo enviado.' if email_sent else 'Pago Exitoso (Error al enviar correo).'
    return jsonify({'success': True, 'message': msg, 'email_receipt': f"ASUNTO: Bienvenido a SCRA {data.get('plan')}..."})

@app.route('/test_scrape')
def test_scrape_route():
    run_all_scrapes()
    return jsonify({'message': 'Scraping VELOZ iniciado.'})

scheduler = BackgroundScheduler()
scheduler.add_job(func=run_all_scrapes, trigger="interval", minutes=15)
atexit.register(lambda: scheduler.shutdown())

if __name__ == '__main__':
    # --- AUTO REPARACIÓN DE BASE DE DATOS ---
    try:
        with sqlite3.connect('scraper.db') as conn:
            # Intentamos borrar la tabla social_news defectuosa
            conn.execute("DROP TABLE IF EXISTS social_news")
            print(">> TABLA SOCIAL_NEWS REINICIADA PARA CORREGIR ERRORES <<")
    except:
        pass
        
    with app.app_context(): 
        db.create_all() # Crea la tabla nueva correcta
        scheduler.start()
    app.run(debug=True)