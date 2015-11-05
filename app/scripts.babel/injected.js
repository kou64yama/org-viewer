import {Parser, ConverterHTML} from 'org';

function main() {
  const parser = new Parser();
  const doc = parser.parse(document.body.innerText).convert(ConverterHTML);

  document.firstChild.className = 'org-viewer';

  document.body.innerHTML =
    '<div class="page">' +
    '<h1 class="title"><a href="#">' + doc.title + '</a></h1>' +
    '<div class="table-of-contents">' +
    '<h2>Table of contents</h2>' +
    doc.tocHTML +
    '</div>' +
    doc.titleHTML +
    doc.tocHTML +
    doc.contentHTML +
    '</div>';
  document.title = doc.title;
}

if (document.contentType === 'text/plain') {
  main();
}
