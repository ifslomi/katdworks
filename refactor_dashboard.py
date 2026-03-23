with open('src/pages/Dashboard.tsx', 'r') as file:
    content = file.read()

lines = content.split('\n')

blocks = {}
block_names = [
    'Brand and Navigation Studio',
    'Hero Section Editor',
    'Profile Image',
    'About Section Editor',
    'Portfolio PDF',
    'Experience List',
    'Skills & Certifications',
    'Projects Section'
]

editor_start_idx = 342
editor_end_idx = 1189
current_block = None
current_content = []

for i, line in enumerate(lines):
    if i > 342 and i <= 1189:
        found_block = False
        for name in block_names:
            if f'{{/* {name} */}}' in line:
                if current_block:
                    blocks[current_block] = '\n'.join(current_content).rstrip()
                current_block = name
                current_content = [line]
                found_block = True
                break
        
        if found_block:
            continue
            
        if current_block:
            current_content.append(line)

if current_block:
    blocks[current_block] = '\n'.join(current_content).rstrip()
    
if '          </motion.div>' in blocks['Projects Section']:
    blocks['Projects Section'] = blocks['Projects Section'].replace('          </motion.div>', '').rstrip()

# Exact literal string replacements! Safe!
def rewrite_classes(s):
    s = s.replace('className="col-span-1 md:col-span-2 xl:col-span-3 bg-white', 'className="w-full flex flex-col gap-6 bg-white')
    s = s.replace('className="col-span-1 md:col-span-1 xl:col-span-2 bg-surface', 'className="w-full flex flex-col gap-6 bg-surface')
    s = s.replace('className="col-span-1 md:col-span-1 xl:col-span-1 border', 'className="w-full flex flex-col gap-6 border')
    s = s.replace('className="col-span-1 md:col-span-2 xl:col-span-2 bg-surface', 'className="w-full flex flex-col gap-6 bg-surface')
    s = s.replace('className="col-span-1 md:col-span-1 xl:col-span-2 bg-surface', 'className="w-full flex flex-col gap-6 bg-surface')
    s = s.replace('className="col-span-1 md:col-span-2 xl:col-span-1 flex', 'className="w-full flex flex-col gap-6')
    s = s.replace('className="col-span-1 md:col-span-2 xl:col-span-3 bg-surface', 'className="w-full flex flex-col gap-6 bg-surface')
    return s

for name in blocks:
    blocks[name] = rewrite_classes(blocks[name])

new_editor = """          {/* Editor Interface: Masonry-style Stack Layout */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.1 } }
            }}
            className="flex flex-col gap-6 w-full"
          >
BLOCK_BRAND

            {/* Middle Masonry Content (Split into Independent Columns) */}
            <div className="flex flex-col xl:flex-row gap-6 items-start w-full">
              
              {/* Left Column (Primary Text Editors) */}
              <div className="flex flex-col gap-6 w-full xl:w-2/3">
BLOCK_HERO
BLOCK_ABOUT
BLOCK_EXP
              </div>

              {/* Right Column (Sidebars & Uploads) */}
              <div className="flex flex-col gap-6 w-full xl:w-1/3">
BLOCK_PROFILE
BLOCK_PDF
BLOCK_SKILLS
              </div>
            </div>

BLOCK_PROJ
          </motion.div>"""

new_editor = new_editor.replace('BLOCK_BRAND', blocks['Brand and Navigation Studio'])
new_editor = new_editor.replace('BLOCK_HERO', blocks['Hero Section Editor'])
new_editor = new_editor.replace('BLOCK_ABOUT', blocks['About Section Editor'])
new_editor = new_editor.replace('BLOCK_EXP', blocks['Experience List'])
new_editor = new_editor.replace('BLOCK_PROFILE', blocks['Profile Image'])
new_editor = new_editor.replace('BLOCK_PDF', blocks['Portfolio PDF'])
new_editor = new_editor.replace('BLOCK_SKILLS', blocks['Skills & Certifications'])
new_editor = new_editor.replace('BLOCK_PROJ', blocks['Projects Section'])

final_content = '\n'.join(lines[:editor_start_idx]) + '\n' + new_editor + '\n' + '\n'.join(lines[1190:])

with open('src/pages/Dashboard.tsx', 'w') as file:
    file.write(final_content)
    
print("Successfully regenerated Dashboard strictly!")
