#!/usr/bin/env python3
"""
Generate a commit-grid style SVG of the Telegram logo.

This script creates a commit grid with the Telegram paper plane logo
using a direct geometric approach for accurate pixel-art representation.
"""

import numpy as np

# Configuration
GRID_SIZE = 31  # 31x31 grid
CELL_SIZE = 10  # SVG pixels per cell
GAP = 2.5  # Gap between cells
COLORS = ['#9fe1cb', '#5dcaa5', '#1d9e75', '#0f6e56']  # Left to right gradient

def is_in_circle_ring(x, y, center, inner_radius, outer_radius):
    """Check if a point is within the circular ring."""
    dx = x - center
    dy = y - center
    dist = np.sqrt(dx*dx + dy*dy)
    return inner_radius <= dist <= outer_radius

def point_in_triangle(x, y, x1, y1, x2, y2, x3, y3):
    """Check if point (x,y) is inside triangle defined by three vertices."""
    # Compute barycentric coordinates
    denom = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
    if abs(denom) < 0.001:
        return False

    a = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / denom
    b = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / denom
    c = 1 - a - b

    return 0 <= a <= 1 and 0 <= b <= 1 and 0 <= c <= 1

def create_telegram_logo_grid(grid_size):
    """
    Create the Telegram paper plane logo on a grid.
    Uses two-triangle kite/arrowhead shape sharing a center fold.
    The plane points toward the upper-right.
    """
    grid = np.zeros((grid_size, grid_size), dtype=bool)
    center = grid_size / 2.0

    # Telegram paper plane vertices
    tip_x, tip_y = 11, -11       # Nose (upper-right)
    left_x, left_y = -11, -3     # Left wingtip
    bottom_x, bottom_y = 3, 11   # Bottom wingtip
    center_x, center_y = -3, 3   # Center fold

    for i in range(grid_size):
        for j in range(grid_size):
            # Normalize coordinates to center
            x = j - center
            y = i - center

            # Check if point is in upper wing triangle
            in_upper = point_in_triangle(x, y, left_x, left_y, tip_x, tip_y, center_x, center_y)

            # Check if point is in lower wing triangle
            in_lower = point_in_triangle(x, y, center_x, center_y, tip_x, tip_y, bottom_x, bottom_y)

            # Include if in either wing
            grid[i, j] = in_upper or in_lower

    return grid

def generate_svg(grid_size):
    """Generate SVG markup from the grid."""
    center = grid_size / 2.0
    outer_radius = grid_size / 2.0
    inner_radius = grid_size / 2.0 - 2.0  # 2 cells thick ring

    svg_lines = []
    viewbox_size = grid_size * (CELL_SIZE + GAP) - GAP
    svg_lines.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {viewbox_size} {viewbox_size}">')
    svg_lines.append('  <!--')
    svg_lines.append(f'    {grid_size}x{grid_size} circular commit grid with vector Telegram logo')
    svg_lines.append('    - Circular outline of commits')
    svg_lines.append('    - Vector Telegram paper plane in center')
    svg_lines.append('    - Colors darken left to right')
    svg_lines.append('')
    svg_lines.append(f'    Cell size: {CELL_SIZE}px, Gap: {GAP}px')
    svg_lines.append('  -->')
    svg_lines.append('')
    
    # Define gradient
    svg_lines.append('  <defs>')
    svg_lines.append('    <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">')
    svg_lines.append(f'      <stop offset="0%" style="stop-color:{COLORS[0]};stop-opacity:1" />')
    svg_lines.append(f'      <stop offset="100%" style="stop-color:{COLORS[-1]};stop-opacity:1" />')
    svg_lines.append('    </linearGradient>')
    svg_lines.append('  </defs>')
    svg_lines.append('')

    # Generate rectangles for the circular ring
    for i in range(grid_size):
        for j in range(grid_size):
            # Check if in circular ring
            if is_in_circle_ring(j, i, center, inner_radius, outer_radius):
                x = j * (CELL_SIZE + GAP)
                y = i * (CELL_SIZE + GAP)

                # Choose color based on column (left to right gradient)
                color_index = min(int(j / grid_size * len(COLORS)), len(COLORS) - 1)
                color = COLORS[color_index]

                svg_lines.append(f'  <rect x="{x}" y="{y}" width="{CELL_SIZE}" height="{CELL_SIZE}" rx="2" fill="{color}"/>')

    # Add Telegram paper plane path
    # Scaled and centered
    # The viewbox is 385x385. Center is 192.5.
    # Official path simplified and transformed:
    svg_lines.append('')
    svg_lines.append('  <!-- Vector Telegram Logo centered and scaled -->')
    # Path data for a clean Telegram logo
    path_data = "M311,102.5 L69,195.5 L158,233.5 L158,308.5 L204,258.5 L266,304.5 L311,102.5 Z M166,226.5 L268,145.5 L178,241.5 L166,226.5 Z"
    # Centering transform:
    # 1. translate(-190, -205.5) -> Move original path center to (0,0)
    # 2. scale(0.85) -> Scale down (bigger than previous 0.6)
    # 3. translate(192.5, 192.5) -> Move to viewbox center
    transform_str = 'transform="translate(192.5, 192.5) scale(0.85) translate(-190, -205.5)"'
    svg_lines.append(f'  <path d="{path_data}" fill="url(#logoGradient)" {transform_str} />')

    svg_lines.append('</svg>')

    return '\n'.join(svg_lines)

def main():
    print(f"Generating {GRID_SIZE}x{GRID_SIZE} Telegram logo commit grid...")

    # Generate SVG
    print("Generating SVG output...")
    svg_content = generate_svg(GRID_SIZE)

    # Write output
    output_path = 'src/templates/circular-prototype.svg'
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(svg_content)

    print(f"Generated: {output_path}")
    print(f"  Grid size: {GRID_SIZE}x{GRID_SIZE}")
    print(f"  Cell size: {CELL_SIZE}px")
    print(f"  Gap: {GAP}px")
    print(f"  Colors: {', '.join(COLORS)}")
    print("\nYou can now open the SVG file in a browser to verify the output.")


if __name__ == '__main__':
    main()
