import zlib
import struct
import math
import os

def make_png(width, height, draw_fn, filepath):
    # RGBA raw data
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # filter type 0 (None)
        for x in range(width):
            r, g, b, a = draw_fn(x, y, width, height)
            raw_data.extend([r, g, b, a])
    
    # Compress IDAT
    compressed = zlib.compress(bytes(raw_data), level=9)
    
    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = zlib.crc32(c) & 0xffffffff
        return struct.pack('>I', len(data)) + c + struct.pack('>I', crc)
    
    # Build PNG chunks
    header = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    png_bytes = (
        b'\x89PNG\r\n\x1a\n' +
        chunk(b'IHDR', header) +
        chunk(b'IDAT', compressed) +
        chunk(b'IEND', b'')
    )
    
    with open(filepath, 'wb') as f:
        f.write(png_bytes)
    print(f"[PNG GENERATION] Saved {filepath} ({width}x{height})")

def neoai_icon_shader(x, y, w, h):
    # Normalize coordinates -1.0 to 1.0
    nx = (x / w) * 2.0 - 1.0
    ny = (y / h) * 2.0 - 1.0
    dist = math.sqrt(nx * nx + ny * ny)

    # Background gradient: Deep Dark Slate (#0b0f19 to #1e293b)
    bg_r = int(11 + (30 - 11) * (y / h))
    bg_g = int(15 + (41 - 15) * (y / h))
    bg_b = int(25 + (59 - 25) * (y / h))

    # Inner Glow Circle
    if dist < 0.8:
        # Radial Cyan to Blue Glow (#00f2fe -> #4facfe)
        glow_factor = max(0.0, 1.0 - dist / 0.8)
        r = int(bg_r * (1 - glow_factor) + (37 * glow_factor))
        g = int(bg_g * (1 - glow_factor) + (99 * glow_factor))
        b = int(bg_b * (1 - glow_factor) + (235 * glow_factor))
        
        # Center Sparkle / N Emblem
        if abs(nx) < 0.25 and abs(ny) < 0.4:
            # Bright cyan-white sparkle (#e0f7fa)
            sparkle = 1.0 - (abs(nx)/0.25 + abs(ny)/0.4)/2.0
            r = int(r * (1 - sparkle) + 224 * sparkle)
            g = int(g * (1 - sparkle) + 247 * sparkle)
            b = int(b * (1 - sparkle) + 250 * sparkle)
        return r, g, b, 255
    else:
        return bg_r, bg_g, bg_b, 255

pub_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", "public")
make_png(192, 192, neoai_icon_shader, os.path.join(pub_dir, "pwa-192x192.png"))
make_png(512, 512, neoai_icon_shader, os.path.join(pub_dir, "pwa-512x512.png"))
make_png(512, 512, neoai_icon_shader, os.path.join(pub_dir, "maskable-icon-512x512.png"))
make_png(180, 180, neoai_icon_shader, os.path.join(pub_dir, "apple-touch-icon.png"))
