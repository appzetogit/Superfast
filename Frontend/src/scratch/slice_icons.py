import os
from PIL import Image

def remove_background_and_autocrop(img, threshold=25):
    # Convert to RGBA
    rgba = img.convert("RGBA")
    datas = rgba.getdata()
    
    newData = []
    for item in datas:
        # Check if the pixel is dark (below threshold)
        if item[0] < threshold and item[1] < threshold and item[2] < threshold:
            # Make it fully transparent
            newData.append((0, 0, 0, 0))
        else:
            newData.append(item)
            
    rgba.putdata(newData)
    
    # Trim empty transparent borders
    bbox = rgba.getbbox()
    if bbox:
        return rgba.crop(bbox)
    return rgba

def slice_grid():
    img_path = r"C:\Users\Abcom\.gemini\antigravity-ide\brain\615c6cf1-8f32-4c76-bb89-2777781dce6a\funky_grocery_icons_sheet_1780904211355.png"
    dest_dir = r"c:\Users\Abcom\Desktop\AppzetoProjects\OyeChotuu\Frontend\src\assets\funky"
    os.makedirs(dest_dir, exist_ok=True)
    
    img = Image.open(img_path)
    width, height = img.size
    
    # 2 rows, 5 columns
    rows = 2
    cols = 5
    
    cell_w = width // cols
    cell_h = height // rows
    
    idx = 0
    for r in range(rows):
        for c in range(cols):
            left = c * cell_w
            top = r * cell_h
            right = left + cell_w
            bottom = top + cell_h
            
            cell = img.crop((left, top, right, bottom))
            transparent_cell = remove_background_and_autocrop(cell, threshold=30)
            
            save_path = os.path.join(dest_dir, f"icon_{idx}.png")
            transparent_cell.save(save_path, "PNG")
            print(f"Saved {save_path} with size {transparent_cell.size}")
            idx += 1

if __name__ == "__main__":
    slice_grid()
