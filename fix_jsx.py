import re

with open('src/pages/Dashboard.tsx', 'r') as f:
    text = f.read()

# Fix comments
text = re.sub(r'<!--(.*?)-->', r'{/*\1*/}', text)

# Fix open tags that need closing (input, img, br, hr) 
# Note: we need to find <input ... > and close it <input ... />
def close_tag(match):
    m = match.group(0)
    if not m.endswith('/>'):
        return m[:-1] + ' />'
    return m

text = re.sub(r'<input[^>]*>', close_tag, text)
text = re.sub(r'<img[^>]*>', close_tag, text)

with open('src/pages/Dashboard.tsx', 'w') as f:
    f.write(text)
