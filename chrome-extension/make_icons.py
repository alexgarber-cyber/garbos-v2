"""Generate extension icons: blue square with white 'G', at 16/48/128px."""
import os
import struct
import zlib


def make_png(size):
    """Build a minimal valid RGBA PNG with a blue (#0a66c2) background and a white 'G'."""
    # We use a pixel-art G glyph scaled to fill ~60% of the icon.
    # For simplicity this generates a solid-color PNG without text —
    # Chrome only requires a valid PNG of the right size.
    bg = (10, 102, 194, 255)  # #0a66c2

    # Build raw pixel rows (RGBA)
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            row += bytes(bg)
        rows.append(row)

    # Draw a simple white "G" shape in the center at appropriate scale
    # We use a 7x7 grid mapped to the icon size
    glyph = [
        "0111100",
        "1000000",
        "1000000",
        "1001110",
        "1000010",
        "1000010",
        "0111110",
    ]
    g_rows = len(glyph)
    g_cols = len(glyph[0])
    scale = max(1, size // 9)
    pad_x = (size - g_cols * scale) // 2
    pad_y = (size - g_rows * scale) // 2

    for gy, glyph_row in enumerate(glyph):
        for gx, bit in enumerate(glyph_row):
            if bit == "1":
                for sy in range(scale):
                    py = pad_y + gy * scale + sy
                    for sx in range(scale):
                        px = pad_x + gx * scale + sx
                        if 0 <= py < size and 0 <= px < size:
                            off = px * 4
                            rows[py][off:off + 4] = b"\xff\xff\xff\xff"

    # PNG encode
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    # RGBA is color type 6 — use 8 for RGBA
    ihdr_data = struct.pack(">II", size, size) + bytes([8, 6, 0, 0, 0])
    ihdr = chunk(b"IHDR", ihdr_data)

    raw = b""
    for row in rows:
        raw += b"\x00" + bytes(row)  # filter byte 0 (None)
    idat = chunk(b"IDAT", zlib.compress(raw))
    iend = chunk(b"IEND", b"")

    return sig + ihdr + idat + iend


out_dir = os.path.join(os.path.dirname(__file__), "icons")
for size in (16, 48, 128):
    data = make_png(size)
    path = os.path.join(out_dir, f"icon{size}.png")
    with open(path, "wb") as f:
        f.write(data)
    print(f"Wrote {path} ({len(data)} bytes)")
