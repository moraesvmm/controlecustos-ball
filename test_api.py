import urllib.request
import json

try:
    req = urllib.request.Request('http://localhost:8080/api/movimentacoes/dashboard')
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        print(data['timeline'][-1])
except Exception as e:
    print(e)
