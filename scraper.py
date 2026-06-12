import os
from pathlib import Path

# --- НАСТРОЙКИ ФИЛЬТРАЦИИ ---

# Директории, которые нужно пропустить
EXCLUDE_DIRS = {
    '.git', '.idea', '.vscode', '__pycache__', 
    'venv', 'env', 'node_modules', 'build', 'instructions', 'dist', 'out'
}

# Расширения файлов, которые нужно пропустить
EXCLUDE_EXTENSIONS = {
    # Текстовые и документация
    '.md', '.txt', '.rst', '.log',
    # Файлы блокировок зависимостей
    '.lock', 'package-lock.json', 'yarn.lock',
    # Бинарные и медиа файлы
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.mp4', '.mp3', '.svg',
    # Базы данных и скомпилированный код
    '.sqlite', '.sqlite3', '.db', '.pyc', '.pyo', '.pyd', '.class'
}

def generate_tree(dir_path, prefix=""):
    """Генерирует строковое представление дерева директорий."""
    tree_str = ""
    try:
        entries = sorted(os.listdir(dir_path))
    except PermissionError:
        return ""

    # Фильтруем скрытые файлы и исключенные директории
    entries = [e for e in entries if e not in EXCLUDE_DIRS and not e.startswith('.')]

    for i, entry in enumerate(entries):
        path = os.path.join(dir_path, entry)
        is_last = i == (len(entries) - 1)
        connector = "└── " if is_last else "├── "

        if os.path.isdir(path):
            tree_str += f"{prefix}{connector}{entry}/\n"
            extension = "    " if is_last else "│   "
            tree_str += generate_tree(path, prefix=prefix + extension)
        else:
            _, ext = os.path.splitext(entry)
            if ext.lower() not in EXCLUDE_EXTENSIONS and entry not in EXCLUDE_EXTENSIONS:
                tree_str += f"{prefix}{connector}{entry}\n"

    return tree_str

def scrape_project(target_dir, output_file):
    """Собирает дерево и содержимое файлов проекта в один документ."""
    target_path = Path(target_dir).resolve()

    with open(output_file, 'w', encoding='utf-8') as outfile:
        # 1. Записываем структуру проекта
        outfile.write("=" * 60 + "\n")
        outfile.write("PROJECT DIRECTORY TREE\n")
        outfile.write("=" * 60 + "\n\n")
        outfile.write(f"{target_path.name}/\n")
        outfile.write(generate_tree(target_dir))
        outfile.write("\n\n")

        # 2. Собираем содержимое файлов
        outfile.write("=" * 60 + "\n")
        outfile.write("PROJECT FILES CONTENT\n")
        outfile.write("=" * 60 + "\n\n")

        for root, dirs, files in os.walk(target_dir):
            # Модифицируем список dirs на месте, чтобы os.walk не заходил в исключенные директории
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith('.')]

            for file in files:
                # Пропускаем скрытые файлы
                if file.startswith('.'):
                    continue

                _, ext = os.path.splitext(file)
                # Проверяем как расширение, так и полное имя (например, для yarn.lock)
                if ext.lower() in EXCLUDE_EXTENSIONS or file.lower() in EXCLUDE_EXTENSIONS:
                    continue

                # ИСПРАВЛЕНИЕ: приводим путь файла к абсолютному виду перед сравнением
                file_path = (Path(root) / file).resolve()
                relative_path = file_path.relative_to(target_path)
                
                # Пропускаем сам файл вывода, если он создается внутри проекта
                if file_path.name == Path(output_file).name:
                    continue

                try:
                    with open(file_path, 'r', encoding='utf-8') as infile:
                        content = infile.read()

                    # Форматирование для ИИ: четкие границы начала и конца файла
                    outfile.write(f"--- BEGIN FILE: {relative_path} ---\n")
                    outfile.write(content)
                    if not content.endswith('\n'):
                        outfile.write("\n")
                    outfile.write(f"--- END FILE: {relative_path} ---\n\n")

                except UnicodeDecodeError:
                    # Пропускаем файлы, которые не читаются как текст (например, бинарники без расширения)
                    continue
                except Exception as e:
                    outfile.write(f"--- ERROR READING FILE: {relative_path} ({e}) ---\n\n")

if __name__ == "__main__":
    # Укажите путь к проекту. Точка "." означает текущую директорию.
    PROJECT_DIRECTORY = "." 
    
    # Имя файла, в который будет сохранен результат
    OUTPUT_FILENAME = "project_context_for_ai.txt"

    print(f"Начинаю сбор данных из {os.path.abspath(PROJECT_DIRECTORY)}...")
    scrape_project(PROJECT_DIRECTORY, OUTPUT_FILENAME)
    print(f"Готово! Данные успешно сохранены в файл: {OUTPUT_FILENAME}")