from flask import Flask, render_template, request, jsonify, session
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from apscheduler.schedulers.background import BackgroundScheduler 
import atexit 
import os
import requests
from bs4 import BeautifulSoup
from datetime import datetime
import urllib3
import time
import random
from textblob import TextBlob # LIBRERÍA DE NLP

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///scraper.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.urandom(24) 

db = SQLAlchemy(app)

NEWS_SOURCES = [
    'https://rpp.pe/', 'https://rpp.pe/politica', 'https://rpp.pe/actualidad', 'https://rpp.pe/peru',
    'https://rpp.pe/lima', 'https://rpp.pe/mundo', 'https://rpp.pe/economia', 'https://rpp.pe/deportes',
    'https://rpp.pe/tecnologia', 'https://rpp.pe/vital', 'https://rpp.pe/entretenimiento', 'https://rpp.pe/cultura',
    'https://larepublica.pe/', 'https://larepublica.pe/politica', 'https://larepublica.pe/economia',
    'https://larepublica.pe/sociedad', 'https://larepublica.pe/mundo', 'https://larepublica.pe/deportes',
    'https://larepublica.pe/espectaculos', 'https://larepublica.pe/tecnologia', 'https://larepublica.pe/cine-series',
    'https://panamericana.pe/', 'https://panamericana.pe/locales', 'https://panamericana.pe/politica',
    'https://panamericana.pe/nacionales', 'https://panamericana.pe/internacionales',
    'https://panamericana.pe/espectaculos', 'https://panamericana.pe/deportes', 'https://panamericana.pe/salud',
    'https://www.exitosanoticias.pe/', 'https://www.exitosanoticias.pe/actualidad', 'https://www.exitosanoticias.pe/policiales',
    'https://www.exitosanoticias.pe/politica', 'https://www.exitosanoticias.pe/mundo', 'https://www.exitosanoticias.pe/deportes',
    'https://www.exitosanoticias.pe/espectaculos', 'https://www.exitosanoticias.pe/economia',
    'https://andina.pe/', 'https://andina.pe/agencia/politica', 'https://andina.pe/agencia/economia',
    'https://andina.pe/agencia/actualidad', 'https://andina.pe/agencia/deportes', 'https://andina.pe/agencia/mundo',
    'https://andina.pe/agencia/turismo', 'https://andina.pe/agencia/espectaculos'
]

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    def set_password(self, password): self.password_hash = generate_password_hash(password)
    def check_password(self, password): return check_password_hash(self.password_hash, password)

class News(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    source_url = db.Column(db.String(256), nullable=False)
    title = db.Column(db.String(500), nullable=False)
    author = db.Column(db.String(100))
    published_date = db.Column(db.DateTime, default=datetime.utcnow)
    image_url = db.Column(db.String(500))
    summary = db.Column(db.Text, nullable=False)
    scraped_at = db.Column(db.DateTime, default=datetime.utcnow)

def extract_article_data(session_obj, article_url, source_root):
    try:
        response = session_obj.get(article_url, timeout=8, verify=False)
        if response.status_code != 200: return None
        soup = BeautifulSoup(response.text, 'html.parser')
        
        title_elem = soup.find('h1')
        if not title_elem: return None
        title_text = title_elem.text.strip()
        if len(title_text) < 15: return None 

        summary_text = "Haz clic para leer más..."
        possible_contents = [
            soup.find('div', class_='story-contents'), soup.find('div', class_='nota-body'), 
            soup.find('div', class_='content-news'), soup.find('article'), soup.find('main')
        ]
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

        return {'title': title_text, 'summary': summary_text, 'image_url': img_url,
                'author': author_name, 'published_date': datetime.now()}
    except Exception: pass 
    return None

def run_all_scrapes():
    print(f"\n>>> INICIANDO BARRIDO MASIVO: {datetime.now()} <<<")
    s = requests.Session()
    s.headers.update({'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'})
    total_cycle = 0
    
    for source_url in NEWS_SOURCES:
        try:
            print(f"FUENTE: {source_url}")
            response = s.get(source_url, timeout=15, verify=False)
            soup = BeautifulSoup(response.text, 'html.parser')
            links = soup.find_all('a', href=True)
            unique_links = set()
            
            for link in links:
                href = link['href']
                if len(href) > 30 and ('facebook' not in href and 'twitter' not in href): 
                    if not href.startswith('http'):
                        if href.startswith('/'):
                            if "andina.pe" in source_url: base = "https://andina.pe"
                            elif "rpp.pe" in source_url: base = "https://rpp.pe"
                            elif "larepublica.pe" in source_url: base = "https://larepublica.pe"
                            else: base = source_url.rstrip('/')
                            if base.endswith('/') and href.startswith('/'): href = base[:-1] + href
                            else: href = base + href
                        else:
                            if "andina.pe" in source_url: href = "https://andina.pe/agencia/" + href
                            else: href = source_url + href
                    unique_links.add(href)
                    if len(unique_links) >= 200: break 

            print(f"   > Enlaces: {len(unique_links)}")
            
            for url in unique_links:
                exists = False
                with app.app_context():
                    if News.query.filter_by(source_url=url).first(): exists = True
                if exists: continue

                time.sleep(random.uniform(0.2, 0.8)) 
                
                data = extract_article_data(s, url, source_url)
                if data:
                    with app.app_context():
                        if not News.query.filter_by(title=data['title']).first():
                            n = News(source_url=url, title=data['title'], author=data['author'], 
                                   image_url=data['image_url'], summary=data['summary'])
                            db.session.add(n)
                            db.session.commit()
                            total_cycle += 1
                            print(f"     [+] ({total_cycle}) {data['title'][:30]}...")
        except Exception as e: print(f"   [!] Error: {e}")

    print(f"\n<<< CICLO FINALIZADO. TOTAL: {total_cycle} >>>\n")

@app.route('/')
def index(): return render_template('index.html')

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    if not User.query.filter_by(email=data.get('email')).first():
        u = User(email=data.get('email'))
        u.set_password(data.get('password'))
        db.session.add(u); db.session.commit()
        return jsonify({'success': True, 'message': 'Registrado'})
    return jsonify({'success': False, 'message': 'Existe'}), 409

@app.route('/login', methods=['POST'])
def login():
    d = request.get_json()
    u = User.query.filter_by(email=d.get('email')).first()
    if u and u.check_password(d.get('password')):
        session['user_id'] = u.id
        return jsonify({'success': True}) 
    return jsonify({'success': False}), 401

@app.route('/logout')
def logout():
    session.pop('user_id', None)
    return jsonify({'success': True})

# --- API DE NOTICIAS CON PAGINACIÓN Y NLP REAL ---
@app.route('/api/news')
def get_news():
    page = request.args.get('page', 1, type=int)
    per_page = 12 # 12 noticias por página
    
    # Paginación real de SQLAlchemy
    pagination = News.query.order_by(News.published_date.desc()).paginate(page=page, per_page=per_page, error_out=False)
    
    news_list = pagination.items
    results = []
    
    for n in news_list:
        # ANÁLISIS DE SENTIMIENTO REAL (NLP)
        blob = TextBlob(n.title + " " + n.summary)
        polarity = blob.sentiment.polarity
        
        if polarity > 0.1: sentiment = "Positivo"
        elif polarity < -0.1: sentiment = "Negativo"
        else: sentiment = "Neutro"
        
        results.append({
            'title': n.title, 
            'summary': n.summary, 
            'author': n.author, 
            'date': n.published_date.strftime('%Y-%m-%d'), 
            'image': n.image_url, 
            'url': n.source_url,
            'sentiment': sentiment # Dato de IA Real
        })
        
    return jsonify({
        'news': results,
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page,
        'has_next': pagination.has_next,
        'has_prev': pagination.has_prev
    })

@app.route('/api/stats')
def get_stats():
    total_news = News.query.count()
    sources = db.session.query(News.author, db.func.count(News.id)).group_by(News.author).all()
    return jsonify({
        'total': total_news,
        'sources': {'labels': [s[0] for s in sources], 'data': [s[1] for s in sources]}
    })

@app.route('/test_scrape')
def test_scrape_route():
    run_all_scrapes()
    return jsonify({'message': 'Scraping masivo iniciado.'})

scheduler = BackgroundScheduler()
scheduler.add_job(func=run_all_scrapes, trigger="interval", minutes=15)
atexit.register(lambda: scheduler.shutdown())

if __name__ == '__main__':
    with app.app_context(): db.create_all(); scheduler.start()
    app.run(debug=True)