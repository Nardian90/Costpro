import requests
import json

def test_chat():
    url = "http://localhost:3000/api/cost-sheets/ai/chat"
    payload = {
        "messages": [{"role": "user", "content": "Genera ficha de azúcar"}],
        "sheetData": {"header": {"title": "Test Sheet"}}
    }
    # This won't work without a valid session/token, but we can check if it returns 401 at least
    # and if the server is running.
    try:
        response = requests.post(url, json=payload)
        print(f"Status: {response.status_code}")
        print(f"Body: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_chat()
