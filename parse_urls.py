import re
import json
import urllib.request
import urllib.parse
import time
import sys

# Read the raw URL text
raw_text = open('raw_urls.txt', 'r').read()

# Parse URLs - they start with https://youtu.be/
urls = re.findall(r'https://youtu\.be/[A-Za-z0-9_-]+', raw_text)
# Remove duplicates while preserving order
seen = set()
unique_urls = []
for url in urls:
    if url not in seen:
        seen.add(url)
        unique_urls.append(url)

print(f"Found {len(unique_urls)} unique URLs")

# Fetch titles using YouTube oEmbed API
results = []
errors = []

for i, url in enumerate(unique_urls):
    try:
        oembed_url = f"https://www.youtube.com/oembed?url={urllib.parse.quote(url, safe='')}&format=json"
        req = urllib.request.Request(oembed_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            video_id = url.split('/')[-1]
            results.append({
                'url': url,
                'video_id': video_id,
                'title': data.get('title', ''),
                'author': data.get('author_name', '')
            })
            if (i + 1) % 20 == 0:
                print(f"  Processed {i+1}/{len(unique_urls)}...", file=sys.stderr)
    except Exception as e:
        video_id = url.split('/')[-1]
        errors.append({'url': url, 'video_id': video_id, 'error': str(e)})
        if (i + 1) % 20 == 0:
            print(f"  Processed {i+1}/{len(unique_urls)}...", file=sys.stderr)

    # Small delay to avoid rate limiting
    if (i + 1) % 50 == 0:
        time.sleep(1)

print(f"Successfully fetched: {len(results)}", file=sys.stderr)
print(f"Errors: {len(errors)}", file=sys.stderr)

with open('video_data.json', 'w', encoding='utf-8') as f:
    json.dump({'results': results, 'errors': errors}, f, ensure_ascii=False, indent=2)

print("Done! Saved to video_data.json")
