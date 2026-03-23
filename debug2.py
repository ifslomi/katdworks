with open('src/pages/Dashboard.tsx', 'r') as file:
    content = file.read()
    
idx = content.find('Projects Section')
print("After Projects Section end:")
print(content[idx+2000:idx+3000])
