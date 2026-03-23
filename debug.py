with open('/home/codespace/.vscode-remote/data/User/History/73a368a0/yPiB.tsx', 'r') as file:
    content = file.read()
lines = content.split('\n')

blocks = {}
block_names = ['Projects Section']
current_block = None
current_content = []

for i, line in enumerate(lines):
    if i > 342 and i <= 1189:
        if '{/* Projects Section */}' in line:
            current_block = 'Projects Section'
            current_content = [line]
            continue
        if current_block:
            current_content.append(line)

print("len lines:", len(lines))
print("lines 1180 to 1195:")
for i in range(1180, 1195):
    print(f"{i}: {lines[i]}")
    
