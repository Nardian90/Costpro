import pdfplumber
import re
import json
import os
import sys
import requests
from datetime import datetime
from supabase import create_client, Client

# Configuration
# Default to current directory but allow override via env or args
PDF_PATH = sys.argv[1] if len(sys.argv) > 1 else "p3.pdf"
AUDIT_PATH = sys.argv[2] if len(sys.argv) > 2 else "PICK3_PDF_AUDIT.json"

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "https://wthkddeleylijmonclxg.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

def get_supabase() -> Client:
    if not SUPABASE_KEY:
        raise Exception("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY")
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def normalize_date(date_str):
    try:
        dt = datetime.strptime(date_str, "%m/%d/%y")
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return None

def download_pdf(url, dest):
    print(f"Downloading PDF from {url} to {dest}...")
    response = requests.get(url, stream=True)
    response.raise_for_status()
    with open(dest, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)

def extract_from_pdf(pdf_path, max_pages=None):
    results = []
    metrics = {"total_detected": 0, "valid": 0, "rejected": 0, "pages": 0}

    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")

    with pdfplumber.open(pdf_path) as pdf:
        pages_to_process = pdf.pages[:max_pages] if max_pages else pdf.pages
        metrics["pages_processed"] = len(pages_to_process)
        metrics["total_pages"] = len(pdf.pages)

        for page in pages_to_process:
            words = page.extract_words()
            if not words: continue

            words.sort(key=lambda w: (w['top'], w['x0']))

            columns = [[], [], []]
            for w in words:
                if w['top'] < 100: continue
                if w['x0'] < 150: columns[0].append(w)
                elif 150 <= w['x0'] < 330: columns[1].append(w)
                else: columns[2].append(w)

            for col_words in columns:
                if not col_words: continue
                rows = []
                current_row = [col_words[0]]
                for i in range(1, len(col_words)):
                    if abs(col_words[i]['top'] - current_row[0]['top']) < 3.0:
                        current_row.append(col_words[i])
                    else:
                        rows.append(current_row)
                        current_row = [col_words[i]]
                rows.append(current_row)

                for row in rows:
                    text = " ".join(w['text'] for w in row)
                    date_match = re.search(r"(\d{2}/\d{2}/\d{2})", text)
                    type_match = re.search(r"\b([ME])\b", text)

                    if date_match and type_match:
                        metrics["total_detected"] += 1
                        all_digits = re.findall(r"(\d)", text)
                        if len(all_digits) >= 9:
                            win_nums = [int(all_digits[6]), int(all_digits[7]), int(all_digits[8])]
                            fb_val = None
                            if len(all_digits) > 9:
                                if re.search(r"(?:FB\s*|B)(\d)", text):
                                    fb_val = int(re.search(r"(?:FB\s*|B)(\d)", text).group(1))
                                else:
                                    fb_val = int(all_digits[9])

                            results.append({
                                "draw_date": normalize_date(date_match.group(1)),
                                "draw_time": "midday" if type_match.group(1) == "M" else "evening",
                                "result": win_nums,
                                "fireball": fb_val,
                                "source": "florida_pick3_pdf",
                                "sync_method": "pdf_pipeline_v2",
                                "raw_text": text
                            })
                            metrics["valid"] += 1
                        else:
                            metrics["rejected"] += 1
    return results, metrics

def main():
    print(f"[{datetime.now().isoformat()}] Starting Florida PICK3 PDF Pipeline...")

    current_pdf = PDF_PATH
    if current_pdf.startswith("http"):
        temp_pdf = "/tmp/p3_sync.pdf"
        download_pdf(current_pdf, temp_pdf)
        current_pdf = temp_pdf

    results, metrics = extract_from_pdf(current_pdf)
    print(f"[{datetime.now().isoformat()}] Extraction Complete.")
    print(f"Metrics: {json.dumps(metrics, indent=2)}")

    if not results:
        print("No results found. Exiting.")
        sys.exit(0)

    results.sort(key=lambda x: (x['draw_date'], x['draw_time']))

    print(f"[{datetime.now().isoformat()}] Upserting {len(results)} records to Supabase...")
    sb = get_supabase()

    batch_size = 200
    total_upserted = 0
    for i in range(0, len(results), batch_size):
        batch = results[i:i+batch_size]
        try:
            sb.table("pick3_history").upsert(
                batch, on_conflict="draw_date,draw_time"
            ).execute()
            total_upserted += len(batch)
        except Exception as e:
            print(f"Error in batch {i//batch_size + 1}: {e}")

    audit_data = {
        "timestamp": datetime.now().isoformat(),
        "metrics": metrics,
        "sample_last": results[-1] if results else None,
        "total_records_ingested": total_upserted
    }

    # Use /tmp if the provided path is not writable or if we are in a serverless env
    try:
        with open(AUDIT_PATH, "w") as f:
            json.dump(audit_data, f, indent=2)
    except Exception as e:
        print(f"Warning: Could not write audit file to {AUDIT_PATH}: {e}")
        alt_path = f"/tmp/{os.path.basename(AUDIT_PATH)}"
        print(f"Trying alternative path: {alt_path}")
        with open(alt_path, "w") as f:
            json.dump(audit_data, f, indent=2)

    print(f"[{datetime.now().isoformat()}] Pipeline finished successfully.")

if __name__ == "__main__":
    main()
