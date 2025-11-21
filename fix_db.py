import sqlite3
import os

db_path = 'scraper.db'

if os.path.exists(db_path):
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Borramos SOLO la tabla de redes sociales que está dando problemas
        cursor.execute("DROP TABLE IF EXISTS social_news")
        conn.commit()
        
        print("✅ ÉXITO: Tabla 'social_news' eliminada correctamente.")
        print("   -> La próxima vez que inicies app.py, se creará automáticamente con la estructura correcta.")
        print("   -> TUS NOTICIAS PRINCIPALES (RPP, ETC) ESTÁN A SALVO. NO SE BORRARON.")
        
        conn.close()
    except Exception as e:
        print(f"❌ Error: {e}")
else:
    print("⚠️ No encontré el archivo scraper.db. Asegúrate de estar en la carpeta correcta.")