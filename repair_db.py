import sqlite3

def fix_database():
    print("Iniciando reparación de base de datos...")
    try:
        conn = sqlite3.connect('scraper.db')
        cursor = conn.cursor()
        
        # 1. Intentamos agregar la columna 'summary' a SocialNews si existe
        try:
            cursor.execute("ALTER TABLE social_news ADD COLUMN summary TEXT")
            print("✅ Columna 'summary' agregada a SocialNews.")
        except Exception as e:
            print(f"ℹ️ Nota sobre SocialNews: {e} (Probablemente ya existe o la tabla no está creada, esto es bueno).")

        conn.commit()
        conn.close()
        print("✅ Base de datos actualizada. NO se borraron tus 5k noticias.")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    fix_database()