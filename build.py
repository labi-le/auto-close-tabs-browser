#!/usr/bin/env python3
"""
Tab Lifecycle Timer — Build Script v2.2
Генерирует дистрибутивы для Chromium (Blink) и Firefox (Gecko).
"""

import json
import os
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
DIST = ROOT / "dist"
SOURCE_FILES = [
    "manifest.json",
    "background.js",
    "popup.html",
    "popup.js",
    "dashboard.html",
    "dashboard.js",
]

# --- Chromium-совместимый манифест (service_worker) ---
CHROMIUM_BACKGROUND = {
    "background": {
        "service_worker": "background.js"
    }
}

# --- Firefox-совместимый манифест (Event Pages / scripts) ---
FIREFOX_BACKGROUND = {
    "background": {
        "scripts": ["background.js"],
        "type": "module"
    }
}


def load_manifest():
    with open(ROOT / "manifest.json", "r", encoding="utf-8") as f:
        return json.load(f)


def write_manifest(target_dir, manifest, background_section):
    m = dict(manifest)
    m.update(background_section)
    # Firefox не поддерживает "host_permissions" в том же виде — оставляем для совместимости
    with open(target_dir / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(m, f, indent=2, ensure_ascii=False)
        f.write("\n")


def copy_sources(target_dir):
    for filename in SOURCE_FILES:
        src = ROOT / filename
        if src.exists():
            shutil.copy2(src, target_dir / filename)
        else:
            print(f"[WARN] Файл {filename} не найден, пропускаем.")


def make_zip(target_dir, zip_path):
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in target_dir.iterdir():
            if file.is_file():
                zf.write(file, arcname=file.name)


def build():
    manifest = load_manifest()
    version = manifest.get("version", "0.0")

    # Очистка dist/
    if DIST.exists():
        shutil.rmtree(DIST)

    for target in ("chromium", "firefox"):
        target_dir = DIST / target
        target_dir.mkdir(parents=True, exist_ok=True)

        # Сначала копируем все исходные файлы, потом перезаписываем manifest.json
        copy_sources(target_dir)

        if target == "chromium":
            write_manifest(target_dir, manifest, CHROMIUM_BACKGROUND)
        else:
            write_manifest(target_dir, manifest, FIREFOX_BACKGROUND)

        print(f"[OK] {target}: файлы скопированы в {target_dir}")

    # Создание архивов
    for target in ("chromium", "firefox"):
        target_dir = DIST / target
        zip_path = DIST / f"{target}.zip"
        make_zip(target_dir, zip_path)
        print(f"[OK] Архив создан: {zip_path}")

    print(f"\n✅ Сборка v{version} завершена. Готовые дистрибутивы в {DIST}/")


if __name__ == "__main__":
    build()
