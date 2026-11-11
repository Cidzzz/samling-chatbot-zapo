import urllib.request, json, os

env_vars = {}
with open('.env') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env_vars[k.strip()] = v.strip().strip('\'').strip('\"')

base_url = env_vars.get('AI_BASE_URL', 'https://r.dwiai.web.id/v1')
api_key = env_vars.get('AI_API_KEY')
model = env_vars.get('AI_MODEL', 'ag/gemini-3.6-flash-low')

req = urllib.request.Request(
    f"{base_url}/chat/completions",
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    },
    data=json.dumps({
        "model": model,
        "messages": [
            {"role": "user", "content": "Keluarkan JSON: {\"status\": \"ok\"}"}
        ],
        "temperature": 0.1
    }).encode("utf-8")
)

with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode("utf-8"))
    msg = data["choices"][0]["message"]
    print("Content:", repr(msg.get("content")))
    print("Reasoning:", repr(msg.get("reasoning_content")))
