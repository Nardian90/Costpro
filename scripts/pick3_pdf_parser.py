import pdfplumber
import re
import json
import os
import sys
from datetime import datetime
from supabase import create_client, Client

# Configuration
PDF_PATH = "p3.pdf"
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "https://wthkddeleylijmonclxg.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0aGtkZGVsZXlsaWptb25jbHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0NzUxMzIsImV4cCI6MjA4MzA1MTEzMn0.ooFYAgZtOh4PXRAKsEWDrXaNpWy3aikmX_Grl4kQavU")

def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def normalize_date(date_str):
    try:
        dt = datetime.strptime(date_str, "%m/%d/%y")
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return None

def extract_from_pdf(pdf_path, max_pages=None):
    results = []
    metrics = {"total_detected": 0, "valid": 0, "rejected": 0, "pages": 0}

    with pdfplumber.open(pdf_path) as pdf:
        pages_to_process = pdf.pages[:max_pages] if max_pages else pdf.pages
        metrics["pages_processed"] = len(pages_to_process)
        metrics["total_pages"] = len(pdf.pages)

        for page_idx, page in enumerate(pages_to_process):
            words = page.extract_words()
            if not words: continue

            words.sort(key=lambda w: (w['top'], w['x0']))

            # Split page into 3 vertical columns
            # Column boundaries: ~14-150, 150-330, 330-600
            columns = [[], [], []]
            for w in words:
                if w['top'] < 100: continue # Header skip

                if w['x0'] < 150: columns[0].append(w)
                elif 150 <= w['x0'] < 330: columns[1].append(w)
                else: columns[2].append(w)

            for col_words in columns:
                if not col_words: continue

                # Group column words into rows by Y
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

                        # Find all digits in this segment
                        all_digits = re.findall(r"(\d)", text)

                        # Date is MM/DD/YY (6 digits)
                        # Type (0 digits)
                        # Result (3 digits)
                        # FB (1 digit)

                        if len(all_digits) >= 9: # Missing FB is possible
                            # Index 6, 7, 8 are the winning digits
                            win_nums = [int(all_digits[6]), int(all_digits[7]), int(all_digits[8])]

                            # FB is usually the last digit if more than 9 exist
                            fb_val = None
                            if len(all_digits) > 9:
                                # Look for "FB" or "B" marker near the last digit
                                if re.search(r"(?:FB\s*|B)(\d)", text):
                                    fb_val = int(re.search(r"(?:FB\s*|B)(\d)", text).group(1))
                                else:
                                    # Fallback to the 10th digit if marker not found but digit exists
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
    results, metrics = extract_from_pdf(PDF_PATH)
    print(f"[{datetime.now().isoformat()}] Extraction Complete.")
    print(f"Metrics: {json.dumps(metrics, indent=2)}")

    if not results:
        print("No results found. Exiting.")
        sys.exit(0)

    # Sort results chronologically
    results.sort(key=lambda x: (x['draw_date'], x['draw_time']))

    print(f"[{datetime.now().isoformat()}] Upserting {len(results)} records to Supabase...")
    supabase = get_supabase()

    batch_size = 200
    total_upserted = 0
    for i in range(0, len(results), batch_size):
        batch = results[i:i+batch_size]
        try:
            response = supabase.table("pick3_history").upsert(
                batch, on_conflict="draw_date,draw_time"
            ).execute()
            total_upserted += len(batch)
            print(f"Uploaded batch {i//batch_size + 1}/{len(results)//batch_size + 1} ({total_upserted} records)")
        except Exception as e:
            print(f"Error in batch {i//batch_size + 1}: {e}")

    # Create audit report
    audit_data = {
        "timestamp": datetime.now().isoformat(),
        "metrics": metrics,
        "sample_first": results[0] if results else None,
        "sample_last": results[-1] if results else None,
        "total_records_ingested": total_upserted
    }
    with open("PICK3_PDF_AUDIT.json", "w") as f:
        json.dump(audit_data, f, indent=2)

    print(f"[{datetime.now().isoformat()}] Pipeline finished successfully.")
    print(f"Report saved to PICK3_PDF_AUDIT.json")

if __name__ == "__main__":
    main()
