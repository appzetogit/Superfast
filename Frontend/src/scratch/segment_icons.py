import os
from PIL import Image

def remove_background_and_autocrop(rgba, threshold=25):
    data = rgba.getdata()
    newData = []
    for item in data:
        if item[0] < threshold and item[1] < threshold and item[2] < threshold:
            newData.append((0, 0, 0, 0))
        else:
            newData.append(item)
    rgba.putdata(newData)
    
    bbox = rgba.getbbox()
    if bbox:
        return rgba.crop(bbox)
    return rgba

def segment_icons():
    img_path = r"C:\Users\Abcom\.gemini\antigravity-ide\brain\615c6cf1-8f32-4c76-bb89-2777781dce6a\original_grocery_icons_sheet_1780905273903.png"
    dest_dir = r"c:\Users\Abcom\Desktop\AppzetoProjects\OyeChotuu\Frontend\src\assets\funky"
    os.makedirs(dest_dir, exist_ok=True)
    
    img = Image.open(img_path)
    width, height = img.size
    
    scale = 4
    small_w = width // scale
    small_h = height // scale
    small_img = img.resize((small_w, small_h)).convert("L")
    pixels = small_img.load()
    
    threshold = 30
    visited = [[False for _ in range(small_h)] for _ in range(small_w)]
    
    blobs = []
    
    for x in range(small_w):
        for y in range(small_h):
            if pixels[x, y] > threshold and not visited[x][y]:
                queue = [(x, y)]
                visited[x][y] = True
                
                min_bx, min_by = x, y
                max_bx, max_by = x, y
                
                head = 0
                while head < len(queue):
                    cx, cy = queue[head]
                    head += 1
                    
                    if cx < min_bx: min_bx = cx
                    if cy < min_by: min_by = cy
                    if cx > max_bx: max_bx = cx
                    if cy > max_by: max_by = cy
                    
                    for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < small_w and 0 <= ny < small_h:
                            if pixels[nx, ny] > threshold and not visited[nx][ny]:
                                visited[nx][ny] = True
                                queue.append((nx, ny))
                
                # Bounding box dimensions
                bw = (max_bx - min_bx + 1) * scale
                bh = (max_by - min_by + 1) * scale
                
                # Filter out small noise or thin lines (e.g. grid dividers)
                if len(queue) > 80 and bw > 30 and bh > 30:
                    blobs.append((min_bx * scale, min_by * scale, (max_bx + 1) * scale, (max_by + 1) * scale))
                    
    # Sort blobs: row-wise (top to bottom), then column-wise (left to right)
    # We can group blobs into rows if their top coordinates are close (within 100px)
    blobs.sort(key=lambda b: (b[1] // 100, b[0]))
    
    print(f"Found {len(blobs)} valid icons after filtering.")
    
    for idx, box in enumerate(blobs):
        cell = img.crop(box)
        rgba = cell.convert("RGBA")
        final_icon = remove_background_and_autocrop(rgba, threshold=30)
        
        save_path = os.path.join(dest_dir, f"icon_{idx}.png")
        final_icon.save(save_path, "PNG")
        print(f"Saved icon_{idx}.png with size {final_icon.size}")

if __name__ == "__main__":
    segment_icons()
