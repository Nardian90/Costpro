#!/usr/bin/env python3
"""
Parsea el PDF oficial de Florida Lottery Pick 3 y lo sube a Supabase.
Reemplaza TODOS los datos existentes con la verdad oficial del PDF.

Formato del PDF:
  07/03/26 E 3 4 5 FB 5
  07/03/26 M 2 2 6 FB 6
  ...

E = Evening, M = Midday
"""
import subprocess
import os
import re
import json
import urllib.request

PDF_PATH = '/home/z/my-project/upload/p3.pdf'
SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

if not SUPABASE_URL or not SERVICE_KEY:
    print('❌ Faltan variables de entorno')
    exit(1)

# Extraer texto del PDF
print('▶ Extrayendo texto del PDF...')
result = subprocess.run(['pdftotext', PDF_PATH, '-'], capture_output=True, text=True)
text = result.stdout

# Parsear resultados
# Formato: MM/DD/YY E/M X Y Z FB N
# Pero los números están en columnas separadas. Veamos el formato:
# 07/03/26 E 3 4 5 FB 5  (en una línea o en columnas)

results = []

# Pattern 1: Todo en una línea "06/07/26 M 6 - 4 - 1 FB 0"
pattern1 = re.findall(r'(\d{2}/\d{2}/\d{2})\s+(E|M)\s+(\d)\s*[-–]\s*(\d)\s*[-–]\s*(\d)\s*FB\s*(\d)', text)
for m in pattern1:
    date_raw, draw_time, n1, n2, n3, fb = m
    # Convertir MM/DD/YY a YYYY-MM-DD
    mm, dd, yy = date_raw.split('/')
    date = f'20{yy}-{mm}-{dd}'
    results.append({
        'draw_date': date,
        'draw_time': 'evening' if draw_time == 'E' else 'midday',
        'result': [int(n1), int(n2), int(n3)],
        'fireball': int(fb),
        'source': 'official',
        'sync_method': 'pdf',
    })

# Pattern 2: Formato en columnas (fechas en una columna, E/M en otra, números separados)
# El texto tiene formato tipo:
# 07/03/26
# 07/03/26
# E
# M
# 3
# 4
# 5
# 2
# 2
# 6
# FB 5
# FB 6
if len(results) == 0:
    # Buscar bloques de datos
    lines = text.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        # Buscar fecha
        date_match = re.match(r'(\d{2})/(\d{2})/(\d{2})$', line)
        if date_match:
            mm, dd, yy = date_match.groups()
            date = f'20{yy}-{mm}-{dd}'
            
            # Buscar E/M en las siguientes líneas
            j = i + 1
            draw_times = []
            while j < len(lines) and j < i + 4:
                lt = lines[j].strip()
                if lt in ('E', 'M'):
                    draw_times.append(lt)
                    j += 1
                elif re.match(r'\d{2}/\d{2}/\d{2}$', lt):
                    # Otra fecha — las draw_times van alternadas con fechas
                    break
                else:
                    break
            
            # Si encontramos draw_times, buscar números
            if draw_times:
                # Los números están después de todas las fechas y E/M
                # Buscar la sección de números (conjunto de dígitos 0-9 uno por línea)
                # y FB al final
                pass
        
        i += 1

# Si aún no hay resultados, usar pattern de columnas del PDF
if len(results) == 0:
    # El PDF tiene columnas: fecha1, fecha2, E/M1, E/M2, num1_a, num1_b, num1_c, num2_a, num2_b, num2_c, FB1, FB2
    # Pero pdftotext los pone en líneas separadas. Agrupar.
    
    # Buscar todas las fechas, E/M, números y FB en orden
    dates = []
    times = []
    nums = []
    fireballs = []
    
    for line in lines:
        line = line.strip()
        if re.match(r'\d{2}/\d{2}/\d{2}$', line):
            dates.append(line)
        elif line in ('E', 'M') and not line.startswith('FB'):
            times.append(line)
        elif re.match(r'^\d$', line):
            nums.append(int(line))
        elif line.startswith('FB'):
            fb_match = re.search(r'FB\s*(\d)', line)
            if fb_match:
                fireballs.append(int(fb_match.group(1)))
    
    # Agrupar: cada sorteo tiene 1 fecha, 1 E/M, 3 números, 1 FB
    # Las fechas vienen en pares (evening+midday del mismo día)
    # E/M vienen en pares, números vienen en grupos de 6 (3+3), FB en pares
    
    print(f'  Fechas: {len(dates)}, E/M: {len(times)}, Números: {len(nums)}, FB: {len(fireballs)}')
    
    # Cada sorteo = 1 fecha + 1 E/M + 3 números + 1 FB
    n_draws = min(len(dates), len(times), len(nums) // 3, len(fireballs))
    
    for i in range(n_draws):
        date_raw = dates[i]
        mm, dd, yy = date_raw.split('/')
        date = f'20{yy}-{mm}-{dd}'
        draw_time = 'evening' if times[i] == 'E' else 'midday'
        n1, n2, n3 = nums[i*3], nums[i*3+1], nums[i*3+2]
        fb = fireballs[i]
        
        results.append({
            'draw_date': date,
            'draw_time': draw_time,
            'result': [n1, n2, n3],
            'fireball': fb,
            'source': 'official',
            'sync_method': 'pdf',
        })

print(f'\n✅ {len(results)} resultados extraídos del PDF')

if len(results) == 0:
    print('❌ No se pudieron extraer resultados')
    exit(1)

# Mostrar resumen
print(f'\nPrimeros 5:')
for r in results[:5]:
    print(f'  {r["draw_date"]} {r["draw_time"]}: {r["result"]} FB:{r.get("fireball","?")}')
print(f'Últimos 5:')
for r in results[-5:]:
    print(f'  {r["draw_date"]} {r["draw_time"]}: {r["result"]} FB:{r.get("fireball","?")}')

# Deduplicar
seen = set()
unique = []
for r in results:
    key = f'{r["draw_date"]}-{r["draw_time"]}'
    if key not in seen:
        seen.add(key)
        unique.append(r)

print(f'\nÚnicos: {len(unique)}')
print(f'Rango: {unique[-1]["draw_date"]} → {unique[0]["draw_date"]}')

# Subir a Supabase
print(f'\n▶ Subiendo {len(unique)} registros a Supabase...')

# Primero borrar todos los existentes
print('  ▶ Borrando registros existentes...')
req = urllib.request.Request(
    f'{SUPABASE_URL}/rest/v1/pick3_history?id=neq.00000000-0000-0000-0000-000000000000',
    method='DELETE',
    headers={
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
    },
)
resp = urllib.request.urlopen(req)
print(f'  ✅ Borrados (HTTP {resp.status})')

# Subir los nuevos en lotes de 100
batch_size = 100
total_uploaded = 0
for i in range(0, len(unique), batch_size):
    batch = unique[i:i+batch_size]
    data = json.dumps(batch).encode('utf-8')
    
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/pick3_history',
        method='POST',
        headers={
            'apikey': SERVICE_KEY,
            'Authorization': f'Bearer {SERVICE_KEY}',
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates',
        },
        data=data,
    )
    resp = urllib.request.urlopen(req)
    total_uploaded += len(batch)
    print(f'  ✅ Lote {i//batch_size + 1}: {len(batch)} registros (total: {total_uploaded})')

print(f'\n═══ Resumen ═══')
print(f'Total del PDF: {len(results)}')
print(f'Únicos: {len(unique)}')
print(f'Subidos: {total_uploaded}')
print(f'Rango: {unique[-1]["draw_date"]} → {unique[0]["draw_date"]}')
print(f'Fuente: PDF oficial Florida Lottery')
print(f'sync_method: pdf (verdad oficial)')
