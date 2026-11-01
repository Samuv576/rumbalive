#!/usr/bin/env bash
# Crea un issue de GitHub por cada archivo de docs/issues/ (T01..T10).
# Requisitos: GitHub CLI (`gh`) con sesión iniciada (`gh auth login`) y ejecutarlo dentro del repo ya subido.
set -euo pipefail
cd "$(dirname "$0")/.."
for f in docs/issues/T*.md; do
  title=$(head -1 "$f" | sed 's/^# //')
  echo "Creando: $title"
  gh issue create --title "$title" --body "$(tail -n +3 "$f")"
done
