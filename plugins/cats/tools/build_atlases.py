# SPDX-FileCopyrightText: 2026 OpenXPlay.org
# SPDX-License-Identifier: Apache-2.0 OR MIT
# Created by riko chen on 2026-10-16

"""Rebuild: python3 plugins/cats/tools/build_atlases.py SOURCE --contact OUTPUT.

SOURCE contains 'Pet Cats Pack'. Requires Pillow. No interpolation, random values,
filters or external downloads. Palette keys are exact upstream RGB colours.
"""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROWS = [('idle','Idle',10,6,True), ('walking','Walk',8,8,True),
        ('run','Run',8,10,False), ('sitting','Sitting',1,1,True),
        ('laying','Laying',8,5,False), ('sleeping','Sleeping1',1,1,True),
        ('sleeping2','Sleeping2',1,1,True), ('greeting','Meow',4,4,False),
        ('happy','Licking 1',5,4,False), ('purr','Licking 2',5,4,False),
        ('itch','Itch',2,3,False), ('stretch','Stretching',13,8,False)]
# Explicit remaps retain the upstream shading and colourpoint masks.
GINGER = [(155,117,33),(136,103,28),(214,194,149),(136,103,29),(107,80,18),
          (181,152,88),(120,91,24),(149,112,31),(172,122,10),(80,81,33)]
TABBY = [(132,132,132),(168,169,169),(79,79,79),(192,192,192),(160,160,160),
         (100,100,100),(214,214,214),(232,216,42),(101,57,27)]
POINT = [(194,194,194),(98,89,86),(213,213,213),(85,76,72),(93,91,91),
         (131,109,103),(38,119,146),(23,25,25),(113,111,111)]
BREEDS = {
 'orange':(1,GINGER,['ed963d','ce712d','fff0d0','d78031','8c4525','ffd09a','aa5426','df8736','efb656','526d36']),
 'silver':(6,TABBY,['cbd1d2','eef1ed','bdc8c7','f8faf3','dce2df','8c9899','fffdf5','65bd80','374d43']),
 'golden':(1,GINGER,['efcf94','c5a16b','fff2d6','d5b279','8b714d','ffe3b1','a78a5c','e4c285','67bc80','354e3b']),
 'ragdoll':(3,POINT,['eee7d9','807477','fff7e7','514b59','635f6d','a59996','75c7ef','293545','89818a'])}
HEADER = '// SPDX-FileCopyrightText: 2026 OpenXPlay.org\n// SPDX-License-Identifier: Apache-2.0 OR MIT\n// Created by riko chen on 2026-10-16\n\n'

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('--contact',type=Path,required=True)
    args=parser.parse_args()
    source=args.source/'Pet Cats Pack'
    output=Path(__file__).resolve().parents[1]/'assets'
    output.mkdir(exist_ok=True)
    all_frames={}; bounds=[]; hashes={}
    import hashlib
    for breed,(number,keys,values) in BREEDS.items():
        palette=dict(zip(keys,[tuple(bytes.fromhex(v)) for v in values]))
        if breed in ('orange','golden'):
            extra=['b5622b','e58a37','cf7831','f3aa57'] if breed=='orange' else ['b49665','e0bd82','d1ae75','f4d8a2']
            palette.update(zip([(126,94,24),(161,120,30),(143,108,31),(180,136,39)],[tuple(bytes.fromhex(v)) for v in extra]))
        if breed=='ragdoll': palette[(102,96,93)]=(112,104,112)
        frames_by_row=[]
        for state,animation,count,fps,loop in ROWS:
            # Colourpoint pack has no Itch: use its original Licking 2 instead.
            name='Licking 2' if number==3 and animation=='Itch' else animation
            path=source/f'Cat-{number}'/f'Cat-{number}-{name}.png'
            hashes[str(path.relative_to(args.source))]=hashlib.sha256(path.read_bytes()).hexdigest()
            strip=Image.open(path).convert('RGBA');frames=[]
            for i in range(strip.width//50):
                frame=strip.crop((i*50,0,(i+1)*50,50))
                pixels=frame.load()
                top_edges={x:next((y for y in range(50) if pixels[x,y][3]>=128),50) for x in range(50)}
                for y in range(50):
                    for x in range(50):
                        r,g,b,a=pixels[x,y]
                        if a<128: pixels[x,y]=(0,0,0,0);continue
                        rgb=palette.get((r,g,b),(r,g,b))
                        # Shade only the upper contour; keep body markings pale.
                        if breed in ('silver','golden') and x<29 and y==top_edges[x]:
                            rgb=(115,132,133) if breed=='silver' else (160,126,76)
                        # Sparse tabby stripes follow opaque back/tail pixels only.
                        if breed=='orange' and (r,g,b) in GINGER[:2] and x<27 and (x%5==1) and 23<=y<=26:
                            rgb=(166,77,32)
                        if breed=='orange' and (r,g,b)==GINGER[0] and x>=29 and y>=27:
                            rgb=(255,235,200)
                        pixels[x,y]=(*rgb,255)
                bounds.append(frame.getbbox());frames.append(frame)
            frames_by_row.append(frames)
        all_frames[breed]=frames_by_row
    box=(min(b[0] for b in bounds),min(b[1] for b in bounds),max(b[2] for b in bounds),max(b[3] for b in bounds))
    w,h=box[2]-box[0],box[3]-box[1]
    descriptors={}
    sheet=Image.new('RGB',(140+13*w*4,len(ROWS)*h*4*4+4*32),(37,34,43));label=ImageDraw.Draw(sheet)
    for bi,(breed,rows) in enumerate(all_frames.items()):
        atlas=Image.new('RGBA',(13*w,len(ROWS)*h))
        descriptors[breed]={'image':f'{breed}.png','cellWidth':w,'cellHeight':h,'columns':13,'crop':list(box),'rows':[]}
        top=bi*(len(ROWS)*h*4+32)
        label.text((8,top+8),breed,fill='white')
        for ri,((state,animation,count,fps,loop),frames) in enumerate(zip(ROWS,rows)):
            descriptors[breed]['rows'].append({'state':state,'frames':len(frames),'fps':fps,'loop':loop})
            label.text((8,top+32+ri*h*4),animation,fill='white')
            for fi,frame in enumerate(frames):
                cropped=frame.crop(box);atlas.paste(cropped,(fi*w,ri*h))
                sheet.paste(cropped.resize((w*4,h*4),Image.Resampling.NEAREST),(140+fi*w*4,top+32+ri*h*4),cropped.resize((w*4,h*4),Image.Resampling.NEAREST))
        atlas.save(output/f'{breed}.png',optimize=False)
        (output/f'{breed}.pet-atlas.json').write_text(json.dumps(descriptors[breed],indent=2)+'\n')
    (output/'atlases.js').write_text(HEADER+'// Generated by tools/build_atlases.py; JSON descriptors are the source of truth.\nexport const atlases = '+json.dumps(descriptors,indent=2)+';\n')
    icon=Image.new('RGBA',(128,128))
    cat_icon=all_frames['orange'][0][0].crop(box).resize((w*4,h*4),Image.Resampling.NEAREST)
    icon.paste(cat_icon,((128-w*4)//2,(128-h*4)//2))
    icon.save(output/'icon.png')
    vfx=Image.open(source/'Meow-VFX/Meow-VFX.png').convert('RGBA');vfx.save(output/'meow-vfx.png')
    (output/'license.txt').write_text((source/'License.txt').read_text()+'\nCC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/\n')
    (output/'attribution.txt').write_text('Pet Cats Pack by LuizMelo (https://luizmelo.itch.io/pet-cat-pack), CC0 1.0; recoloured by OpenXPlay.org\n')
    (output/'source-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n')
    sheet.save(args.contact)
    print(f'Built four {w}x{h} frame atlases; crop {box}; contact: {args.contact}')

if __name__=='__main__':
    main()
