const configuration = JSON.parse(document.querySelector('#configuration').textContent);
const host = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
for (const button of document.querySelectorAll('[data-command]')) {
  button.addEventListener('click', () => host?.postMessage({ command: button.dataset.command }));
}
window.addEventListener('message', event => {
  if (event.data?.type === 'notice' && typeof event.data.message === 'string') {
    document.querySelector('#notice').textContent = event.data.message;
  }
});

if (configuration.pdfUri) {
  const pages = document.querySelector('#pdfPages');
  const text = document.querySelector('#textVersion');
  const status = document.querySelector('#pdfStatus');
  document.querySelector('#showText').addEventListener('click', () => { pages.hidden = true; text.hidden = false; status.hidden = true; });
  document.querySelector('#showPdf').addEventListener('click', () => {
    pages.hidden = false; text.hidden = true; status.hidden = false;
    if (pdf && document.querySelector('#zoom').value === 'fit') renderSelected().catch(showRenderError);
  });
  let pdf, currentRender = 0;
  const layers = [], renderTasks = [];
  async function renderPages(scale) {
    const generation = ++currentRender;
    for (const task of renderTasks.splice(0)) task.cancel();
    for (const layer of layers.splice(0)) layer.cancel();
    pages.replaceChildren();
    status.textContent = `正在顯示原始 PDF，共 ${pdf.numPages} 頁…`;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      if (generation !== currentRender) return;
      const viewport = page.getViewport({ scale });
      const caption = document.createElement('p');
      caption.className = 'page-caption';
      caption.textContent = `第 ${number} / ${pdf.numPages} 頁`;
      const container = document.createElement('div');
      container.className = 'pdf-page';
      container.style.width = `${viewport.width}px`;
      container.style.height = `${viewport.height}px`;
      container.style.setProperty('--total-scale-factor', String(scale));
      const canvas = document.createElement('canvas');
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      container.append(canvas);
      pages.append(caption, container);
      const renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport,
        transform: pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0] });
      renderTasks.push(renderTask);
      try { await renderTask.promise; }
      catch (error) { if (error.name === 'RenderingCancelledException') return; throw error; }
      if (generation !== currentRender) return;
      // Selecting or copying the PDF text does not remove the original graphics.
      const textLayer = document.createElement('div');
      textLayer.className = 'textLayer';
      container.append(textLayer);
      const layer = new pdfjs.TextLayer({ textContentSource: await page.getTextContent(), container: textLayer, viewport });
      layers.push(layer);
      await layer.render();
    }
    if (generation === currentRender) status.textContent = `原始 PDF 已顯示，共 ${pdf.numPages} 頁。可以選取文字，或切換文字版。`;
  }
  const showRenderError = error => { status.textContent = `PDF 顯示失敗：${error.message}。請先使用文字版。`; };
  async function renderSelected() {
    const value = document.querySelector('#zoom').value;
    let scale = Number(value);
    if (value === 'fit') {
      const firstPage = await pdf.getPage(1);
      const width = firstPage.getViewport({ scale: 1 }).width;
      const available = pages.clientWidth || document.body.clientWidth;
      scale = Math.max(0.25, Math.min(2, (available - 12) / width));
    }
    await renderPages(scale);
  }
  let pdfjs;
  try {
    pdfjs = await import(configuration.pdfModuleUri);
    pdfjs.GlobalWorkerOptions.workerSrc = configuration.pdfWorkerUri;
    const task = pdfjs.getDocument({ url: configuration.pdfUri, cMapUrl: configuration.cMapUri,
      cMapPacked: true, standardFontDataUrl: configuration.fontUri, wasmUrl: configuration.wasmUri,
      isEvalSupported: false, enableXfa: false });
    pdf = await task.promise;
    await renderSelected();
    document.querySelector('#zoom').addEventListener('change', () => {
      renderSelected().catch(showRenderError);
    });
    let resizeTimer;
    window.addEventListener('resize', () => {
      if (document.querySelector('#zoom').value !== 'fit' || pages.hidden) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => renderSelected().catch(showRenderError), 150);
    });
    window.addEventListener('unload', () => task.destroy());
  } catch (error) {
    status.textContent = `PDF 顯示失敗：${error.message}。請先使用「文字版」，圖表仍保存在原始 PDF。`;
    pages.hidden = true;
    text.hidden = false;
  }
}
