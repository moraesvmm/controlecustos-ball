import os

app_path = r'\\britufps01\group\Manutenção\25 - SISTEMA CONTROLE DE CUSTOS\controle-rc-system\js\app.js'

with open(app_path, 'r', encoding='utf-8') as f:
    content = f.read()

target = """// Drag to scroll
function initDragToScroll() {
  const sliders = document.querySelectorAll('.table-scroll-inner');
  sliders.forEach(slider => {
    let isDown = false;
    let startX;
    let scrollLeft;

    slider.addEventListener('mousedown', (e) => {
      // Prevent drag if clicking on the horizontal scrollbar
      if (e.offsetY >= slider.clientHeight) return;
      isDown = true;
      slider.style.cursor = 'grabbing';
      startX = e.pageX - slider.offsetLeft;
      scrollLeft = slider.scrollLeft;
    });
    
    slider.addEventListener('mouseleave', () => {
      isDown = false;
      slider.style.cursor = 'default';
    });
    
    slider.addEventListener('mouseup', () => {
      isDown = false;
      slider.style.cursor = 'default';
    });
    
    slider.addEventListener('mousemove', (e) => {
      if (!isDown) {
        // Change cursor to grab only if not hovering the scrollbar
        slider.style.cursor = (e.offsetY >= slider.clientHeight) ? 'default' : 'grab';
        return;
      }
      e.preventDefault();
      const x = e.pageX - slider.offsetLeft;
      const walk = (x - startX) * 1.5; 
      slider.scrollLeft = scrollLeft - walk;
    });
  });
}"""

replacement = """// Drag to scroll
function initDragToScroll() {
  const sliders = document.querySelectorAll('.table-scroll-inner');
  sliders.forEach(slider => {
    let isDown = false;
    let startX;
    let scrollLeft;

    const onMouseMove = (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - slider.offsetLeft;
      const walk = (x - startX) * 1.5; 
      slider.scrollLeft = scrollLeft - walk;
    };

    const onMouseUp = () => {
      isDown = false;
      slider.style.cursor = 'grab';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    slider.addEventListener('mousedown', (e) => {
      // Prevent drag if clicking on the native horizontal scrollbar
      if (e.target === slider && e.offsetY >= slider.clientHeight) return;
      
      isDown = true;
      slider.style.cursor = 'grabbing';
      startX = e.pageX - slider.offsetLeft;
      scrollLeft = slider.scrollLeft;

      // Attach events to window so dragging continues even if mouse leaves the table
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
    
    slider.addEventListener('mouseleave', () => {
      if (!isDown) {
        slider.style.cursor = 'default';
      }
    });
    
    slider.addEventListener('mousemove', (e) => {
      if (!isDown) {
        // Change cursor to grab only if not hovering the scrollbar
        const isScrollbar = e.target === slider && e.offsetY >= slider.clientHeight;
        const newCursor = isScrollbar ? 'default' : 'grab';
        if (slider.style.cursor !== newCursor) {
          slider.style.cursor = newCursor;
        }
      }
    });
  });
}"""

import re
content = re.sub(re.escape(target), replacement, content)

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Drag to scroll logic updated successfully.")
