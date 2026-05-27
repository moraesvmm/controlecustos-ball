import json
import os

transcript_path = r'C:\Users\VMORAES1\.gemini\antigravity\brain\cba0b666-ba03-455a-a384-ea4d17bebd1a\.system_generated\logs\transcript.jsonl'

# I will use git checkout to ensure the base is the 5-days-old app.js
os.system("git checkout js/app.js")

app_js_path = r'C:\Users\VMORAES1\controle-rc-system\js\app.js'
with open(app_js_path, 'r', encoding='utf-8') as f:
    content = f.read()

def apply_replace(content, target, replacement, allow_multiple):
    if allow_multiple:
        return content.replace(target, replacement)
    else:
        count = content.count(target)
        if count == 1:
            return content.replace(target, replacement)
        elif count == 0:
            # print("Target not found! Skipping...")
            return content
        else:
            return content

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
        except:
            continue
        
        if 'tool_calls' in data:
            for call in data['tool_calls']:
                name = call.get('name')
                args = call.get('args', {})
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except:
                        pass
                
                if not isinstance(args, dict):
                    continue

                target_file = args.get('TargetFile', '')
                if 'app.js' in target_file:
                    if name == 'replace_file_content':
                        tc = args.get('TargetContent', '')
                        rc = args.get('ReplacementContent', '')
                        am = args.get('AllowMultiple') == 'true' or args.get('AllowMultiple') is True
                        content = apply_replace(content, tc, rc, am)
                    elif name == 'multi_replace_file_content':
                        chunks = args.get('ReplacementChunks', [])
                        if isinstance(chunks, str):
                            try:
                                chunks = json.loads(chunks)
                            except:
                                chunks = []
                        for chunk in chunks:
                            if isinstance(chunk, dict):
                                tc = chunk.get('TargetContent', '')
                                rc = chunk.get('ReplacementContent', '')
                                am = chunk.get('AllowMultiple') == 'true' or chunk.get('AllowMultiple') is True
                                content = apply_replace(content, tc, rc, am)

with open(r'C:\Users\VMORAES1\controle-rc-system\js\app_recovered.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done!')
