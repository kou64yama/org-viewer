(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
if (typeof exports !== "undefined") {
  function exportModule(module) {
    for (var exportedName in module) {
      if (module.hasOwnProperty(exportedName)) {
        exports[exportedName] = module[exportedName];
      }
    }
  }

  exportModule(require("./org/parser.js"));
  exportModule(require("./org/lexer.js"));
  exportModule(require("./org/node.js"));
  exportModule(require("./org/parser.js"));
  exportModule(require("./org/stream.js"));
  exportModule(require("./org/converter/html.js"));
}

},{"./org/converter/html.js":3,"./org/lexer.js":4,"./org/node.js":5,"./org/parser.js":6,"./org/stream.js":7}],2:[function(require,module,exports){
var Node = require("../node.js").Node;

function Converter() {
}

Converter.prototype = {
  exportOptions: {
    headerOffset: 1,
    exportFromLineNumber: false,
    suppressSubScriptHandling: false,
    suppressAutoLink: false,
    // HTML
    translateSymbolArrow: false,
    suppressCheckboxHandling: false,
    // { "directive:": function (node, childText, auxData) {} }
    customDirectiveHandler: null,
    // e.g., "org-js-"
    htmlClassPrefix: null,
    htmlIdPrefix: null
  },

  untitled: "Untitled",
  result: null,

  // TODO: Manage TODO lists

  initialize: function (orgDocument, exportOptions) {
    this.orgDocument = orgDocument;
    this.documentOptions = orgDocument.options || {};
    this.exportOptions = exportOptions || {};

    this.headers = [];
    this.headerOffset =
      typeof this.exportOptions.headerOffset === "number" ? this.exportOptions.headerOffset : 1;
    this.sectionNumbers = [0];
  },

  createTocItem: function (headerNode, parentTocs) {
    var childTocs = [];
    childTocs.parent = parentTocs;
    var tocItem = { headerNode: headerNode, childTocs: childTocs };
    return tocItem;
  },

  computeToc: function (exportTocLevel) {
    if (typeof exportTocLevel !== "number")
      exportTocLevel = Infinity;

    var toc = [];
    toc.parent = null;

    var previousLevel = 1;
    var currentTocs = toc;  // first

    for (var i = 0; i < this.headers.length; ++i) {
      var headerNode = this.headers[i];

      if (headerNode.level > exportTocLevel)
        continue;

      var levelDiff = headerNode.level - previousLevel;
      if (levelDiff > 0) {
        for (var j = 0; j < levelDiff; ++j) {
          if (currentTocs.length === 0) {
            // Create a dummy tocItem
            var dummyHeader = Node.createHeader([], {
              level: previousLevel + j
            });
            dummyHeader.sectionNumberText = "";
            currentTocs.push(this.createTocItem(dummyHeader, currentTocs));
          }
          currentTocs = currentTocs[currentTocs.length - 1].childTocs;
        }
      } else if (levelDiff < 0) {
        levelDiff = -levelDiff;
        for (var k = 0; k < levelDiff; ++k) {
          currentTocs = currentTocs.parent;
        }
      }

      currentTocs.push(this.createTocItem(headerNode, currentTocs));

      previousLevel = headerNode.level;
    }

    return toc;
  },

  convertNode: function (node, recordHeader, insideCodeElement) {
    if (!insideCodeElement) {
      if (node.type === Node.types.directive) {
        if (node.directiveName === "example" ||
            node.directiveName === "src") {
          insideCodeElement = true;
        }
      } else if (node.type === Node.types.preformatted) {
        insideCodeElement = true;
      }
    }

    if (typeof node === "string") {
      node = Node.createText(null, { value: node });
    }

    var childText = node.children ? this.convertNodesInternal(node.children, recordHeader, insideCodeElement) : "";
    var text;

    var auxData = this.computeAuxDataForNode(node);

    switch (node.type) {
    case Node.types.header:
      // Parse task status
      var taskStatus = null;
      if (childText.indexOf("TODO ") === 0)
        taskStatus = "todo";
      else if (childText.indexOf("DONE ") === 0)
        taskStatus = "done";

      // Compute section number
      var sectionNumberText = null;
      if (recordHeader) {
        var thisHeaderLevel = node.level;
        var previousHeaderLevel = this.sectionNumbers.length;
        if (thisHeaderLevel > previousHeaderLevel) {
          // Fill missing section number
          var levelDiff = thisHeaderLevel - previousHeaderLevel;
          for (var j = 0; j < levelDiff; ++j) {
            this.sectionNumbers[thisHeaderLevel - 1 - j] = 0; // Extend
          }
        } else if (thisHeaderLevel < previousHeaderLevel) {
          this.sectionNumbers.length = thisHeaderLevel; // Collapse
        }
        this.sectionNumbers[thisHeaderLevel - 1]++;
        sectionNumberText = this.sectionNumbers.join(".");
        node.sectionNumberText = sectionNumberText; // Can be used in ToC
      }

      text = this.convertHeader(node, childText, auxData,
                                taskStatus, sectionNumberText);

      if (recordHeader)
        this.headers.push(node);
      break;
    case Node.types.orderedList:
      text = this.convertOrderedList(node, childText, auxData);
      break;
    case Node.types.unorderedList:
      text = this.convertUnorderedList(node, childText, auxData);
      break;
    case Node.types.definitionList:
      text = this.convertDefinitionList(node, childText, auxData);
      break;
    case Node.types.listElement:
      if (node.isDefinitionList) {
        var termText = this.convertNodesInternal(node.term, recordHeader, insideCodeElement);
        text = this.convertDefinitionItem(node, childText, auxData,
                                          termText, childText);
      } else {
        text = this.convertListItem(node, childText, auxData);
      }
      break;
    case Node.types.paragraph:
      text = this.convertParagraph(node, childText, auxData);
      break;
    case Node.types.preformatted:
      text = this.convertPreformatted(node, childText, auxData);
      break;
    case Node.types.table:
      text = this.convertTable(node, childText, auxData);
      break;
    case Node.types.tableRow:
      text = this.convertTableRow(node, childText, auxData);
      break;
    case Node.types.tableCell:
      if (node.isHeader)
        text = this.convertTableHeader(node, childText, auxData);
      else
        text = this.convertTableCell(node, childText, auxData);
      break;
    case Node.types.horizontalRule:
      text = this.convertHorizontalRule(node, childText, auxData);
      break;
      // ============================================================ //
      // Inline
      // ============================================================ //
    case Node.types.inlineContainer:
      text = this.convertInlineContainer(node, childText, auxData);
      break;
    case Node.types.bold:
      text = this.convertBold(node, childText, auxData);
      break;
    case Node.types.italic:
      text = this.convertItalic(node, childText, auxData);
      break;
    case Node.types.underline:
      text = this.convertUnderline(node, childText, auxData);
      break;
    case Node.types.code:
      text = this.convertCode(node, childText, auxData);
      break;
    case Node.types.dashed:
      text = this.convertDashed(node, childText, auxData);
      break;
    case Node.types.link:
      text = this.convertLink(node, childText, auxData);
      break;
    case Node.types.directive:
      switch (node.directiveName) {
      case "quote":
        text = this.convertQuote(node, childText, auxData);
        break;
      case "example":
        text = this.convertExample(node, childText, auxData);
        break;
      case "src":
        text = this.convertSrc(node, childText, auxData);
        break;
      case "html":
      case "html:":
        text = this.convertHTML(node, childText, auxData);
        break;
      default:
        if (this.exportOptions.customDirectiveHandler &&
            this.exportOptions.customDirectiveHandler[node.directiveName]) {
          text = this.exportOptions.customDirectiveHandler[node.directiveName](
            node, childText, auxData
          );
        } else {
          text = childText;
        }
      }
      break;
    case Node.types.text:
      text = this.convertText(node.value, insideCodeElement);
      break;
    default:
      throw Error("Unknown node type: " + node.type);
    }

    if (typeof this.postProcess === "function") {
      text = this.postProcess(node, text, insideCodeElement);
    }

    return text;
  },

  convertText: function (text, insideCodeElement) {
    var escapedText = this.escapeSpecialChars(text, insideCodeElement);

    if (!this.exportOptions.suppressSubScriptHandling && !insideCodeElement) {
      escapedText = this.makeSubscripts(escapedText, insideCodeElement);
    }
    if (!this.exportOptions.suppressAutoLink) {
      escapedText = this.linkURL(escapedText);
    }

    return escapedText;
  },

  // By default, ignore html
  convertHTML: function (node, childText, auxData) {
    return childText;
  },

  convertNodesInternal: function (nodes, recordHeader, insideCodeElement) {
    var nodesTexts = [];
    for (var i = 0; i < nodes.length; ++i) {
      var node = nodes[i];
      var nodeText = this.convertNode(node, recordHeader, insideCodeElement);
      nodesTexts.push(nodeText);
    }
    return this.combineNodesTexts(nodesTexts);
  },

  convertHeaderBlock: function (headerBlock, recordHeader) {
    throw Error("convertHeaderBlock is not implemented");
  },

  convertHeaderTree: function (headerTree, recordHeader) {
    return this.convertHeaderBlock(headerTree, recordHeader);
  },

  convertNodesToHeaderTree: function (nodes, nextBlockBegin, blockHeader) {
    var childBlocks = [];
    var childNodes = [];

    if (typeof nextBlockBegin === "undefined") {
      nextBlockBegin = 0;
    }
    if (typeof blockHeader === "undefined") {
      blockHeader = null;
    }

    for (var i = nextBlockBegin; i < nodes.length;) {
      var node = nodes[i];

      var isHeader = node.type === Node.types.header;

      if (!isHeader) {
        childNodes.push(node);
        i = i + 1;
        continue;
      }

      // Header
      if (blockHeader && node.level <= blockHeader.level) {
        // Finish Block
        break;
      } else {
        // blockHeader.level < node.level
        // Begin child block
        var childBlock = this.convertNodesToHeaderTree(nodes, i + 1, node);
        childBlocks.push(childBlock);
        i = childBlock.nextIndex;
      }
    }

    // Finish block
    return {
      header: blockHeader,
      childNodes: childNodes,
      nextIndex: i,
      childBlocks: childBlocks
    };
  },

  convertNodes: function (nodes, recordHeader, insideCodeElement) {
    return this.convertNodesInternal(nodes, recordHeader, insideCodeElement);
  },

  combineNodesTexts: function (nodesTexts) {
    return nodesTexts.join("");
  },

  getNodeTextContent: function (node) {
    if (node.type === Node.types.text)
      return this.escapeSpecialChars(node.value);
    else
      return node.children ? node.children.map(this.getNodeTextContent, this).join("") : "";
  },

  // @Override
  escapeSpecialChars: function (text) {
    throw Error("Implement escapeSpecialChars");
  },

  // http://daringfireball.net/2010/07/improved_regex_for_matching_urls
  urlPattern: /\b(?:https?:\/\/|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’])/ig,

  // @Override
  linkURL: function (text) {
    var self = this;
    return text.replace(this.urlPattern, function (matched) {
      if (matched.indexOf("://") < 0)
        matched = "http://" + matched;
      return self.makeLink(matched);
    });
  },

  makeLink: function (url) {
    throw Error("Implement makeLink");
  },

  makeSubscripts: function (text) {
    if (this.documentOptions["^"] === "{}")
      return text.replace(/\b([^_ \t]*)_{([^}]*)}/g,
                          this.makeSubscript);
    else if (this.documentOptions["^"])
      return text.replace(/\b([^_ \t]*)_([^_]*)\b/g,
                          this.makeSubscript);
    else
      return text;
  },

  makeSubscript: function (match, body, subscript) {
    throw Error("Implement makeSubscript");
  },

  stripParametersFromURL: function (url) {
    return url.replace(/\?.*$/, "");
  },

  imageExtensionPattern: new RegExp("(" + [
    "bmp", "png", "jpeg", "jpg", "gif", "tiff",
    "tif", "xbm", "xpm", "pbm", "pgm", "ppm", "svg"
  ].join("|") + ")$", "i")
};

if (typeof exports !== "undefined")
  exports.Converter = Converter;

},{"../node.js":5}],3:[function(require,module,exports){
var Converter = require("./converter.js").Converter;
var Node = require("../node.js").Node;

function ConverterHTML(orgDocument, exportOptions) {
  this.initialize(orgDocument, exportOptions);
  this.result = this.convert();
}

ConverterHTML.prototype = {
  __proto__: Converter.prototype,

  convert: function () {
    var title = this.orgDocument.title ? this.convertNode(this.orgDocument.title) : this.untitled;
    var titleHTML = this.tag("h" + Math.max(Number(this.headerOffset), 1), title);
    var contentHTML = this.convertNodes(this.orgDocument.nodes, true /* record headers */);
    var toc = this.computeToc(this.documentOptions["toc"]);
    var tocHTML = this.tocToHTML(toc);

    return {
      title: title,
      titleHTML: titleHTML,
      contentHTML: contentHTML,
      tocHTML: tocHTML,
      toc: toc,
      toString: function () {
        return titleHTML + tocHTML + "\n" + contentHTML;
      }
    };
  },

  tocToHTML: function (toc) {
    function tocToHTMLFunction(tocList) {
      var html = "";
      for (var i = 0; i < tocList.length; ++i) {
        var tocItem = tocList[i];
        var sectionNumberText = tocItem.headerNode.sectionNumberText;
        var sectionNumber = this.documentOptions.num ?
              this.inlineTag("span", sectionNumberText, {
                "class": "section-number"
              }) : "";
        var header = this.getNodeTextContent(tocItem.headerNode);
        var headerLink = this.inlineTag("a", sectionNumber + header, {
          href: "#header-" + sectionNumberText.replace(/\./g, "-")
        });
        var subList = tocItem.childTocs.length ? tocToHTMLFunction.call(this, tocItem.childTocs) : "";
        html += this.tag("li", headerLink + subList);
      }
      return this.tag("ul", html);
    }

    return tocToHTMLFunction.call(this, toc);
  },

  computeAuxDataForNode: function (node) {
    while (node.parent &&
           node.parent.type === Node.types.inlineContainer) {
      node = node.parent;
    }
    var attributesNode = node.previousSibling;
    var attributesText = "";
    while (attributesNode &&
           attributesNode.type === Node.types.directive &&
           attributesNode.directiveName === "attr_html:") {
      attributesText += attributesNode.directiveRawValue + " ";
      attributesNode = attributesNode.previousSibling;
    }
    return attributesText;
  },

  // Method to construct org-js generated class
  orgClassName: function (className) {
    return this.exportOptions.htmlClassPrefix ?
      this.exportOptions.htmlClassPrefix + className
      : className;
  },

  // Method to construct org-js generated id
  orgId: function (id) {
    return this.exportOptions.htmlIdPrefix ?
      this.exportOptions.htmlIdPrefix + id
      : id;
  },

  // ----------------------------------------------------
  // Node conversion
  // ----------------------------------------------------

  convertHeader: function (node, childText, auxData,
                           taskStatus, sectionNumberText) {
    var headerAttributes = {};

    if (taskStatus) {
      childText = this.inlineTag("span", childText.substring(0, 4), {
        "class": "task-status " + taskStatus
      }) + childText.substring(5);
    }

    if (sectionNumberText) {
      childText = this.inlineTag("span", sectionNumberText, {
        "class": "section-number"
      }) + childText;
      headerAttributes["id"] = "header-" + sectionNumberText.replace(/\./g, "-");
    }

    if (taskStatus)
      headerAttributes["class"] = "task-status " + taskStatus;

    return this.tag("h" + (this.headerOffset + node.level),
                    childText, headerAttributes, auxData);
  },

  convertOrderedList: function (node, childText, auxData) {
    return this.tag("ol", childText, null, auxData);
  },

  convertUnorderedList: function (node, childText, auxData) {
    return this.tag("ul", childText, null, auxData);
  },

  convertDefinitionList: function (node, childText, auxData) {
    return this.tag("dl", childText, null, auxData);
  },

  convertDefinitionItem: function (node, childText, auxData,
                                   term, definition) {
    return this.tag("dt", term) + this.tag("dd", definition);
  },

  convertListItem: function (node, childText, auxData) {
    if (this.exportOptions.suppressCheckboxHandling) {
      return this.tag("li", childText, null, auxData);
    } else {
      var listItemAttributes = {};
      var listItemText = childText;
      // Embed checkbox
      if (/^\s*\[(X| |-)\]([\s\S]*)/.exec(listItemText)) {
        listItemText = RegExp.$2 ;
        var checkboxIndicator = RegExp.$1;

        var checkboxAttributes = { type: "checkbox" };
        switch (checkboxIndicator) {
        case "X":
          checkboxAttributes["checked"] = "true";
          listItemAttributes["data-checkbox-status"] = "done";
          break;
        case "-":
          listItemAttributes["data-checkbox-status"] = "intermediate";
          break;
        default:
          listItemAttributes["data-checkbox-status"] = "undone";
          break;
        }

        listItemText = this.inlineTag("input", null, checkboxAttributes) + listItemText;
      }

      return this.tag("li", listItemText, listItemAttributes, auxData);
    }
  },

  convertParagraph: function (node, childText, auxData) {
    return this.tag("p", childText, null, auxData);
  },

  convertPreformatted: function (node, childText, auxData) {
    return this.tag("pre", childText, null, auxData);
  },

  convertTable: function (node, childText, auxData) {
    return this.tag("table", this.tag("tbody", childText), null, auxData);
  },

  convertTableRow: function (node, childText, auxData) {
    return this.tag("tr", childText);
  },

  convertTableHeader: function (node, childText, auxData) {
    return this.tag("th", childText);
  },

  convertTableCell: function (node, childText, auxData) {
    return this.tag("td", childText);
  },

  convertHorizontalRule: function (node, childText, auxData) {
    return this.tag("hr", null, null, auxData);
  },

  convertInlineContainer: function (node, childText, auxData) {
    return childText;
  },

  convertBold: function (node, childText, auxData) {
    return this.inlineTag("b", childText);
  },

  convertItalic: function (node, childText, auxData) {
    return this.inlineTag("i", childText);
  },

  convertUnderline: function (node, childText, auxData) {
    return this.inlineTag("span", childText, {
      style: "text-decoration:underline;"
    });
  },

  convertCode: function (node, childText, auxData) {
    return this.inlineTag("code", childText);
  },

  convertDashed: function (node, childText, auxData) {
    return this.inlineTag("del", childText);
  },

  convertLink: function (node, childText, auxData) {
    var srcParameterStripped = this.stripParametersFromURL(node.src);
    if (this.imageExtensionPattern.exec(srcParameterStripped)) {
      var imgText = this.getNodeTextContent(node);
      return this.inlineTag("img", null, {
        src: node.src,
        alt: imgText,
        title: imgText
      }, auxData);
    } else {
      return this.inlineTag("a", childText, { href: node.src });
    }
  },

  convertQuote: function (node, childText, auxData) {
    return this.tag("blockquote", childText, null, auxData);
  },

  convertExample: function (node, childText, auxData) {
    return this.tag("pre", childText, null, auxData);
  },

  convertSrc: function (node, childText, auxData) {
    var codeLanguage = node.directiveArguments.length
          ? node.directiveArguments[0]
          : "unknown";
    childText = this.tag("code", childText, {
      "class": "language-" + codeLanguage
    }, auxData);
    return this.tag("pre", childText, {
      "class": "prettyprint"
    });
  },

  // @override
  convertHTML: function (node, childText, auxData) {
    if (node.directiveName === "html:") {
      return node.directiveRawValue;
    } else if (node.directiveName === "html") {
      return node.children.map(function (textNode) {
        return textNode.value;
      }).join("\n");
    } else {
      return childText;
    }
  },

  // @implement
  convertHeaderBlock: function (headerBlock, level, index) {
    level = level || 0;
    index = index || 0;

    var contents = [];

    var headerNode = headerBlock.header;
    if (headerNode) {
      contents.push(this.convertNode(headerNode));
    }

    var blockContent = this.convertNodes(headerBlock.childNodes);
    contents.push(blockContent);

    var childBlockContent = headerBlock.childBlocks
          .map(function (block, idx) {
            return this.convertHeaderBlock(block, level + 1, idx);
          }, this)
          .join("\n");
    contents.push(childBlockContent);

    var contentsText = contents.join("\n");

    if (headerNode) {
      return this.tag("section", "\n" + contents.join("\n"), {
        "class": "block block-level-" + level
      });
    } else {
      return contentsText;
    }
  },

  // ----------------------------------------------------
  // Supplemental methods
  // ----------------------------------------------------

  replaceMap: {
    // [replacing pattern, predicate]
    "&": ["&#38;", null],
    "<": ["&#60;", null],
    ">": ["&#62;", null],
    '"': ["&#34;", null],
    "'": ["&#39;", null],
    "->": ["&#10132;", function (text, insideCodeElement) {
      return this.exportOptions.translateSymbolArrow && !insideCodeElement;
    }]
  },

  replaceRegexp: null,

  // @implement @override
  escapeSpecialChars: function (text, insideCodeElement) {
    if (!this.replaceRegexp) {
      this.replaceRegexp = new RegExp(Object.keys(this.replaceMap).join("|"), "g");
    }

    var replaceMap = this.replaceMap;
    var self = this;
    return text.replace(this.replaceRegexp, function (matched) {
      if (!replaceMap[matched]) {
        throw Error("escapeSpecialChars: Invalid match");
      }

      var predicate = replaceMap[matched][1];
      if (typeof predicate === "function" &&
          !predicate.call(self, text, insideCodeElement)) {
        // Not fullfill the predicate
        return matched;
      }

      return replaceMap[matched][0];
    });
  },

  // @implement
  postProcess: function (node, currentText, insideCodeElement) {
    if (this.exportOptions.exportFromLineNumber &&
        typeof node.fromLineNumber === "number") {
      // Wrap with line number information
      currentText = this.inlineTag("div", currentText, {
        "data-line-number": node.fromLineNumber
      });
    }
    return currentText;
  },

  // @implement
  makeLink: function (url) {
    return "<a href=\"" + url + "\">" + decodeURIComponent(url) + "</a>";
  },

  // @implement
  makeSubscript: function (match, body, subscript) {
    return "<span class=\"org-subscript-parent\">" +
      body +
      "</span><span class=\"org-subscript-child\">" +
      subscript +
      "</span>";
  },

  // ----------------------------------------------------
  // Specific methods
  // ----------------------------------------------------

  attributesObjectToString: function (attributesObject) {
    var attributesString = "";
    for (var attributeName in attributesObject) {
      if (attributesObject.hasOwnProperty(attributeName)) {
        var attributeValue = attributesObject[attributeName];
        // To avoid id/class name conflicts with other frameworks,
        // users can add arbitrary prefix to org-js generated
        // ids/classes via exportOptions.
        if (attributeName === "class") {
          attributeValue = this.orgClassName(attributeValue);
        } else if (attributeName === "id") {
          attributeValue = this.orgId(attributeValue);
        }
        attributesString += " " + attributeName + "=\"" + attributeValue + "\"";
      }
    }
    return attributesString;
  },

  inlineTag: function (name, innerText, attributesObject, auxAttributesText) {
    attributesObject = attributesObject || {};

    var htmlString = "<" + name;
    // TODO: check duplicated attributes
    if (auxAttributesText)
      htmlString += " " + auxAttributesText;
    htmlString += this.attributesObjectToString(attributesObject);

    if (innerText === null)
      return htmlString + "/>";

    htmlString += ">" + innerText + "</" + name + ">";

    return htmlString;
  },

  tag: function (name, innerText, attributesObject, auxAttributesText) {
    return this.inlineTag(name, innerText, attributesObject, auxAttributesText) + "\n";
  }
};

if (typeof exports !== "undefined")
  exports.ConverterHTML = ConverterHTML;

},{"../node.js":5,"./converter.js":2}],4:[function(require,module,exports){
// ------------------------------------------------------------
// Syntax
// ------------------------------------------------------------

var Syntax = {
  rules: {},

  define: function (name, syntax) {
    this.rules[name] = syntax;
    var methodName = "is" + name.substring(0, 1).toUpperCase() + name.substring(1);
    this[methodName] = function (line) {
      return this.rules[name].exec(line);
    };
  }
};

Syntax.define("header", /^(\*+)\s+(.*)$/); // m[1] => level, m[2] => content
Syntax.define("preformatted", /^(\s*):(?: (.*)$|$)/); // m[1] => indentation, m[2] => content
Syntax.define("unorderedListElement", /^(\s*)(?:-|\+|\s+\*)\s+(.*)$/); // m[1] => indentation, m[2] => content
Syntax.define("orderedListElement", /^(\s*)(\d+)(?:\.|\))\s+(.*)$/); // m[1] => indentation, m[2] => number, m[3] => content
Syntax.define("tableSeparator", /^(\s*)\|((?:\+|-)*?)\|?$/); // m[1] => indentation, m[2] => content
Syntax.define("tableRow", /^(\s*)\|(.*?)\|?$/); // m[1] => indentation, m[2] => content
Syntax.define("blank", /^$/);
Syntax.define("horizontalRule", /^(\s*)-{5,}$/); //
Syntax.define("directive", /^(\s*)#\+(?:(begin|end)_)?(.*)$/i); // m[1] => indentation, m[2] => type, m[3] => content
Syntax.define("comment", /^(\s*)#(.*)$/);
Syntax.define("line", /^(\s*)(.*)$/);

// ------------------------------------------------------------
// Token
// ------------------------------------------------------------

function Token() {
}

Token.prototype = {
  isListElement: function () {
    return this.type === Lexer.tokens.orderedListElement ||
      this.type === Lexer.tokens.unorderedListElement;
  },

  isTableElement: function () {
    return this.type === Lexer.tokens.tableSeparator ||
      this.type === Lexer.tokens.tableRow;
  }
};

// ------------------------------------------------------------
// Lexer
// ------------------------------------------------------------

function Lexer(stream) {
  this.stream = stream;
  this.tokenStack = [];
}

Lexer.prototype = {
  tokenize: function (line) {
    var token = new Token();
    token.fromLineNumber = this.stream.lineNumber;

    if (Syntax.isHeader(line)) {
      token.type        = Lexer.tokens.header;
      token.indentation = 0;
      token.content     = RegExp.$2;
      // specific
      token.level       = RegExp.$1.length;
    } else if (Syntax.isPreformatted(line)) {
      token.type        = Lexer.tokens.preformatted;
      token.indentation = RegExp.$1.length;
      token.content     = RegExp.$2;
    } else if (Syntax.isUnorderedListElement(line)) {
      token.type        = Lexer.tokens.unorderedListElement;
      token.indentation = RegExp.$1.length;
      token.content     = RegExp.$2;
    } else if (Syntax.isOrderedListElement(line)) {
      token.type        = Lexer.tokens.orderedListElement;
      token.indentation = RegExp.$1.length;
      token.content     = RegExp.$3;
      // specific
      token.number      = RegExp.$2;
    } else if (Syntax.isTableSeparator(line)) {
      token.type        = Lexer.tokens.tableSeparator;
      token.indentation = RegExp.$1.length;
      token.content     = RegExp.$2;
    } else if (Syntax.isTableRow(line)) {
      token.type        = Lexer.tokens.tableRow;
      token.indentation = RegExp.$1.length;
      token.content     = RegExp.$2;
    } else if (Syntax.isBlank(line)) {
      token.type        = Lexer.tokens.blank;
      token.indentation = 0;
      token.content     = null;
    } else if (Syntax.isHorizontalRule(line)) {
      token.type        = Lexer.tokens.horizontalRule;
      token.indentation = RegExp.$1.length;
      token.content     = null;
    } else if (Syntax.isDirective(line)) {
      token.type        = Lexer.tokens.directive;
      token.indentation = RegExp.$1.length;
      token.content     = RegExp.$3;
      // decide directive type (begin, end or oneshot)
      var directiveTypeString = RegExp.$2;
      if (/^begin/i.test(directiveTypeString))
        token.beginDirective = true;
      else if (/^end/i.test(directiveTypeString))
        token.endDirective = true;
      else
        token.oneshotDirective = true;
    } else if (Syntax.isComment(line)) {
      token.type        = Lexer.tokens.comment;
      token.indentation = RegExp.$1.length;
      token.content     = RegExp.$2;
    } else if (Syntax.isLine(line)) {
      token.type        = Lexer.tokens.line;
      token.indentation = RegExp.$1.length;
      token.content     = RegExp.$2;
    } else {
      throw new Error("SyntaxError: Unknown line: " + line);
    }

    return token;
  },

  pushToken: function (token) {
    this.tokenStack.push(token);
  },

  pushDummyTokenByType: function (type) {
    var token = new Token();
    token.type = type;
    this.tokenStack.push(token);
  },

  peekStackedToken: function () {
    return this.tokenStack.length > 0 ?
      this.tokenStack[this.tokenStack.length - 1] : null;
  },

  getStackedToken: function () {
    return this.tokenStack.length > 0 ?
      this.tokenStack.pop() : null;
  },

  peekNextToken: function () {
    return this.peekStackedToken() ||
      this.tokenize(this.stream.peekNextLine());
  },

  getNextToken: function () {
    return this.getStackedToken() ||
      this.tokenize(this.stream.getNextLine());
  },

  hasNext: function () {
    return this.stream.hasNext();
  },

  getLineNumber: function () {
    return this.stream.lineNumber;
  }
};

Lexer.tokens = {};
[
  "header",
  "orderedListElement",
  "unorderedListElement",
  "tableRow",
  "tableSeparator",
  "preformatted",
  "line",
  "horizontalRule",
  "blank",
  "directive",
  "comment"
].forEach(function (tokenName, i) {
  Lexer.tokens[tokenName] = i;
});

// ------------------------------------------------------------
// Exports
// ------------------------------------------------------------

if (typeof exports !== "undefined")
  exports.Lexer = Lexer;

},{}],5:[function(require,module,exports){
function PrototypeNode(type, children) {
  this.type = type;
  this.children = [];

  if (children) {
    for (var i = 0, len = children.length; i < len; ++i) {
      this.appendChild(children[i]);
    }
  }
}
PrototypeNode.prototype = {
  previousSibling: null,
  parent: null,
  get firstChild() {
    return this.children.length < 1 ?
      null : this.children[0];
  },
  get lastChild() {
    return this.children.length < 1 ?
      null : this.children[this.children.length - 1];
  },
  appendChild: function (newChild) {
    var previousSibling = this.children.length < 1 ?
          null : this.lastChild;
    this.children.push(newChild);
    newChild.previousSibling = previousSibling;
    newChild.parent = this;
  },
  toString: function () {
    var string = "<" + this.type + ">";

    if (typeof this.value !== "undefined") {
      string += " " + this.value;
    } else if (this.children) {
      string += "\n" + this.children.map(function (child, idx) {
        return "#" + idx + " " + child.toString();
      }).join("\n").split("\n").map(function (line) {
        return "  " + line;
      }).join("\n");
    }

    return string;
  }
};

var Node = {
  types: {},

  define: function (name, postProcess) {
    this.types[name] = name;

    var methodName = "create" + name.substring(0, 1).toUpperCase() + name.substring(1);
    var postProcessGiven = typeof postProcess === "function";

    this[methodName] = function (children, options) {
      var node = new PrototypeNode(name, children);

      if (postProcessGiven)
        postProcess(node, options || {});

      return node;
    };
  }
};

Node.define("text", function (node, options) {
  node.value = options.value;
});
Node.define("header", function (node, options) {
  node.level = options.level;
});
Node.define("orderedList");
Node.define("unorderedList");
Node.define("definitionList");
Node.define("listElement");
Node.define("paragraph");
Node.define("preformatted");
Node.define("table");
Node.define("tableRow");
Node.define("tableCell");
Node.define("horizontalRule");
Node.define("directive");

// Inline
Node.define("inlineContainer");

Node.define("bold");
Node.define("italic");
Node.define("underline");
Node.define("code");
Node.define("verbatim");
Node.define("dashed");
Node.define("link", function (node, options) {
  node.src = options.src;
});

if (typeof exports !== "undefined")
  exports.Node = Node;

},{}],6:[function(require,module,exports){
var Stream = require("./stream.js").Stream;
var Lexer  = require("./lexer.js").Lexer;
var Node   = require("./node.js").Node;

function Parser() {
  this.inlineParser = new InlineParser();
}

Parser.parseStream = function (stream, options) {
  var parser = new Parser();
  parser.initStatus(stream, options);
  parser.parseNodes();
  return parser.nodes;
};

Parser.prototype = {
  initStatus: function (stream, options) {
    if (typeof stream === "string")
      stream = new Stream(stream);
    this.lexer = new Lexer(stream);
    this.nodes = [];
    this.options = {
      toc: true,
      num: true,
      "^": "{}",
      multilineCell: false
    };
    // Override option values
    if (options && typeof options === "object") {
      for (var key in options) {
        this.options[key] = options[key];
      }
    }
    this.document = {
      options: this.options,
      directiveValues: {},
      convert: function (ConverterClass, exportOptions) {
        var converter = new ConverterClass(this, exportOptions);
        return converter.result;
      }
    };
  },

  parse: function (stream, options) {
    this.initStatus(stream, options);
    this.parseDocument();
    this.document.nodes = this.nodes;
    return this.document;
  },

  createErrorReport: function (message) {
    return new Error(message + " at line " + this.lexer.getLineNumber());
  },

  skipBlank: function () {
    var blankToken = null;
    while (this.lexer.peekNextToken().type === Lexer.tokens.blank)
      blankToken = this.lexer.getNextToken();
    return blankToken;
  },

  setNodeOriginFromToken: function (node, token) {
    node.fromLineNumber = token.fromLineNumber;
    return node;
  },

  appendNode: function (newNode) {
    var previousSibling = this.nodes.length > 0 ? this.nodes[this.nodes.length - 1] : null;
    this.nodes.push(newNode);
    newNode.previousSibling = previousSibling;
  },

  // ------------------------------------------------------------
  // <Document> ::= <Element>*
  // ------------------------------------------------------------

  parseDocument: function () {
    this.parseTitle();
    this.parseNodes();
  },

  parseNodes: function () {
    while (this.lexer.hasNext()) {
      var element = this.parseElement();
      if (element) this.appendNode(element);
    }
  },

  parseTitle: function () {
    this.skipBlank();

    if (this.lexer.hasNext() &&
        this.lexer.peekNextToken().type === Lexer.tokens.line)
      this.document.title = this.createTextNode(this.lexer.getNextToken().content);
    else
      this.document.title = null;

    this.lexer.pushDummyTokenByType(Lexer.tokens.blank);
  },

  // ------------------------------------------------------------
  // <Element> ::= (<Header> | <List>
  //              | <Preformatted> | <Paragraph>
  //              | <Table>)*
  // ------------------------------------------------------------

  parseElement: function () {
    var element = null;

    switch (this.lexer.peekNextToken().type) {
    case Lexer.tokens.header:
      element = this.parseHeader();
      break;
    case Lexer.tokens.preformatted:
      element = this.parsePreformatted();
      break;
    case Lexer.tokens.orderedListElement:
    case Lexer.tokens.unorderedListElement:
      element = this.parseList();
      break;
    case Lexer.tokens.line:
      element = this.parseText();
      break;
    case Lexer.tokens.tableRow:
    case Lexer.tokens.tableSeparator:
      element = this.parseTable();
      break;
    case Lexer.tokens.blank:
      this.skipBlank();
      if (this.lexer.hasNext()) {
        if (this.lexer.peekNextToken().type === Lexer.tokens.line)
          element = this.parseParagraph();
        else
          element = this.parseElement();
      }
      break;
    case Lexer.tokens.horizontalRule:
      this.lexer.getNextToken();
      element = Node.createHorizontalRule();
      break;
    case Lexer.tokens.directive:
      element = this.parseDirective();
      break;
    case Lexer.tokens.comment:
      // Skip
      this.lexer.getNextToken();
      break;
    default:
      throw this.createErrorReport("Unhandled token: " + this.lexer.peekNextToken().type);
    }

    return element;
  },

  parseElementBesidesDirectiveEnd: function () {
    try {
      // Temporary, override the definition of `parseElement`
      this.parseElement = this.parseElementBesidesDirectiveEndBody;
      return this.parseElement();
    } finally {
      this.parseElement = this.originalParseElement;
    }
  },

  parseElementBesidesDirectiveEndBody: function () {
    if (this.lexer.peekNextToken().type === Lexer.tokens.directive &&
        this.lexer.peekNextToken().endDirective) {
      return null;
    }

    return this.originalParseElement();
  },

  // ------------------------------------------------------------
  // <Header>
  //
  // : preformatted
  // : block
  // ------------------------------------------------------------

  parseHeader: function () {
    var headerToken = this.lexer.getNextToken();
    var header = Node.createHeader([
      this.createTextNode(headerToken.content) // TODO: Parse inline markups
    ], { level: headerToken.level });
    this.setNodeOriginFromToken(header, headerToken);

    return header;
  },

  // ------------------------------------------------------------
  // <Preformatted>
  //
  // : preformatted
  // : block
  // ------------------------------------------------------------

  parsePreformatted: function () {
    var preformattedFirstToken = this.lexer.peekNextToken();
    var preformatted = Node.createPreformatted([]);
    this.setNodeOriginFromToken(preformatted, preformattedFirstToken);

    var textContents = [];

    while (this.lexer.hasNext()) {
      var token = this.lexer.peekNextToken();
      if (token.type !== Lexer.tokens.preformatted ||
          token.indentation < preformattedFirstToken.indentation)
        break;
      this.lexer.getNextToken();
      textContents.push(token.content);
    }

    preformatted.appendChild(this.createTextNode(textContents.join("\n"), true /* no emphasis */));

    return preformatted;
  },

  // ------------------------------------------------------------
  // <List>
  //
  //  - foo
  //    1. bar
  //    2. baz
  // ------------------------------------------------------------

  // XXX: not consider codes (e.g., =Foo::Bar=)
  definitionPattern: /^(.*?) :: *(.*)$/,

  parseList: function () {
    var rootToken = this.lexer.peekNextToken();
    var list;
    var isDefinitionList = false;

    if (this.definitionPattern.test(rootToken.content)) {
      list = Node.createDefinitionList([]);
      isDefinitionList = true;
    } else {
      list = rootToken.type === Lexer.tokens.unorderedListElement ?
        Node.createUnorderedList([]) : Node.createOrderedList([]);
    }
    this.setNodeOriginFromToken(list, rootToken);

    while (this.lexer.hasNext()) {
      var nextToken = this.lexer.peekNextToken();
      if (!nextToken.isListElement() || nextToken.indentation !== rootToken.indentation)
        break;
      list.appendChild(this.parseListElement(rootToken.indentation, isDefinitionList));
    }

    return list;
  },

  unknownDefinitionTerm: "???",

  parseListElement: function (rootIndentation, isDefinitionList) {
    var listElementToken = this.lexer.getNextToken();
    var listElement = Node.createListElement([]);
    this.setNodeOriginFromToken(listElement, listElementToken);

    listElement.isDefinitionList = isDefinitionList;

    if (isDefinitionList) {
      var match = this.definitionPattern.exec(listElementToken.content);
      listElement.term = [
        this.createTextNode(match && match[1] ? match[1] : this.unknownDefinitionTerm)
      ];
      listElement.appendChild(this.createTextNode(match ? match[2] : listElementToken.content));
    } else {
      listElement.appendChild(this.createTextNode(listElementToken.content));
    }

    while (this.lexer.hasNext()) {
      var blankToken = this.skipBlank();
      if (!this.lexer.hasNext())
        break;

      var notBlankNextToken = this.lexer.peekNextToken();
      if (blankToken && !notBlankNextToken.isListElement())
        this.lexer.pushToken(blankToken); // Recover blank token only when next line is not listElement.
      if (notBlankNextToken.indentation <= rootIndentation)
        break;                  // end of the list

      var element = this.parseElement(); // recursive
      if (element)
        listElement.appendChild(element);
    }

    return listElement;
  },

  // ------------------------------------------------------------
  // <Table> ::= <TableRow>+
  // ------------------------------------------------------------

  parseTable: function () {
    var nextToken = this.lexer.peekNextToken();
    var table = Node.createTable([]);
    this.setNodeOriginFromToken(table, nextToken);
    var sawSeparator = false;

    var allowMultilineCell = nextToken.type === Lexer.tokens.tableSeparator && this.options.multilineCell;

    while (this.lexer.hasNext() &&
           (nextToken = this.lexer.peekNextToken()).isTableElement()) {
      if (nextToken.type === Lexer.tokens.tableRow) {
        var tableRow = this.parseTableRow(allowMultilineCell);
        table.appendChild(tableRow);
      } else {
        // Lexer.tokens.tableSeparator
        sawSeparator = true;
        this.lexer.getNextToken();
      }
    }

    if (sawSeparator && table.children.length) {
      table.children[0].children.forEach(function (cell) {
        cell.isHeader = true;
      });
    }

    return table;
  },

  // ------------------------------------------------------------
  // <TableRow> ::= <TableCell>+
  // ------------------------------------------------------------

  parseTableRow: function (allowMultilineCell) {
    var tableRowTokens = [];

    while (this.lexer.peekNextToken().type === Lexer.tokens.tableRow) {
      tableRowTokens.push(this.lexer.getNextToken());
      if (!allowMultilineCell) {
        break;
      }
    }

    if (!tableRowTokens.length) {
      throw this.createErrorReport("Expected table row");
    }

    var firstTableRowToken = tableRowTokens.shift();
    var tableCellTexts = firstTableRowToken.content.split("|");

    tableRowTokens.forEach(function (rowToken) {
      rowToken.content.split("|").forEach(function (cellText, cellIdx) {
        tableCellTexts[cellIdx] = (tableCellTexts[cellIdx] || "") + "\n" + cellText;
      });
    });

    // TODO: Prepare two pathes: (1)
    var tableCells = tableCellTexts.map(
      // TODO: consider '|' escape?
      function (text) {
        return Node.createTableCell(Parser.parseStream(text));
      }, this);

    return this.setNodeOriginFromToken(Node.createTableRow(tableCells), firstTableRowToken);
  },

  // ------------------------------------------------------------
  // <Directive> ::= "#+.*"
  // ------------------------------------------------------------

  parseDirective: function () {
    var directiveToken = this.lexer.getNextToken();
    var directiveNode = this.createDirectiveNodeFromToken(directiveToken);

    if (directiveToken.endDirective)
      throw this.createErrorReport("Unmatched 'end' directive for " + directiveNode.directiveName);

    if (directiveToken.oneshotDirective) {
      this.interpretDirective(directiveNode);
      return directiveNode;
    }

    if (!directiveToken.beginDirective)
      throw this.createErrorReport("Invalid directive " + directiveNode.directiveName);

    // Parse begin ~ end
    directiveNode.children = [];
    if (this.isVerbatimDirective(directiveNode))
      return this.parseDirectiveBlockVerbatim(directiveNode);
    else
      return this.parseDirectiveBlock(directiveNode);
  },

  createDirectiveNodeFromToken: function (directiveToken) {
    var matched = /^[ ]*([^ ]*)[ ]*(.*)[ ]*$/.exec(directiveToken.content);

    var directiveNode = Node.createDirective(null);
    this.setNodeOriginFromToken(directiveNode, directiveToken);
    directiveNode.directiveName = matched[1].toLowerCase();
    directiveNode.directiveArguments = this.parseDirectiveArguments(matched[2]);
    directiveNode.directiveOptions = this.parseDirectiveOptions(matched[2]);
    directiveNode.directiveRawValue = matched[2];

    return directiveNode;
  },

  isVerbatimDirective: function (directiveNode) {
    var directiveName = directiveNode.directiveName;
    return directiveName === "src" || directiveName === "example" || directiveName === "html";
  },

  parseDirectiveBlock: function (directiveNode, verbatim) {
    this.lexer.pushDummyTokenByType(Lexer.tokens.blank);

    while (this.lexer.hasNext()) {
      var nextToken = this.lexer.peekNextToken();
      if (nextToken.type === Lexer.tokens.directive &&
          nextToken.endDirective &&
          this.createDirectiveNodeFromToken(nextToken).directiveName === directiveNode.directiveName) {
        // Close directive
        this.lexer.getNextToken();
        return directiveNode;
      }
      var element = this.parseElementBesidesDirectiveEnd();
      if (element)
        directiveNode.appendChild(element);
    }

    throw this.createErrorReport("Unclosed directive " + directiveNode.directiveName);
  },

  parseDirectiveBlockVerbatim: function (directiveNode) {
    var textContent = [];

    while (this.lexer.hasNext()) {
      var nextToken = this.lexer.peekNextToken();
      if (nextToken.type === Lexer.tokens.directive &&
          nextToken.endDirective &&
          this.createDirectiveNodeFromToken(nextToken).directiveName === directiveNode.directiveName) {
        this.lexer.getNextToken();
        directiveNode.appendChild(this.createTextNode(textContent.join("\n"), true));
        return directiveNode;
      }
      textContent.push(this.lexer.stream.getNextLine());
    }

    throw this.createErrorReport("Unclosed directive " + directiveNode.directiveName);
  },

  parseDirectiveArguments: function (parameters) {
    return parameters.split(/[ ]+/).filter(function (param) {
      return param.length && param[0] !== "-";
    });
  },

  parseDirectiveOptions: function (parameters) {
    return parameters.split(/[ ]+/).filter(function (param) {
      return param.length && param[0] === "-";
    });
  },

  interpretDirective: function (directiveNode) {
    // http://orgmode.org/manual/Export-options.html
    switch (directiveNode.directiveName) {
    case "options:":
      this.interpretOptionDirective(directiveNode);
      break;
    case "title:":
      this.document.title = directiveNode.directiveRawValue;
      break;
    case "author:":
      this.document.author = directiveNode.directiveRawValue;
      break;
    case "email:":
      this.document.email = directiveNode.directiveRawValue;
      break;
    default:
      this.document.directiveValues[directiveNode.directiveName] = directiveNode.directiveRawValue;
      break;
    }
  },

  interpretOptionDirective: function (optionDirectiveNode) {
    optionDirectiveNode.directiveArguments.forEach(function (pairString) {
      var pair = pairString.split(":");
      this.options[pair[0]] = this.convertLispyValue(pair[1]);
    }, this);
  },

  convertLispyValue: function (lispyValue) {
    switch (lispyValue) {
    case "t":
      return true;
    case "nil":
      return false;
    default:
      if (/^[0-9]+$/.test(lispyValue))
        return parseInt(lispyValue);
      return lispyValue;
    }
  },

  // ------------------------------------------------------------
  // <Paragraph> ::= <Blank> <Line>*
  // ------------------------------------------------------------

  parseParagraph: function () {
    var paragraphFisrtToken = this.lexer.peekNextToken();
    var paragraph = Node.createParagraph([]);
    this.setNodeOriginFromToken(paragraph, paragraphFisrtToken);

    var textContents = [];

    while (this.lexer.hasNext()) {
      var nextToken = this.lexer.peekNextToken();
      if (nextToken.type !== Lexer.tokens.line
          || nextToken.indentation < paragraphFisrtToken.indentation)
        break;
      this.lexer.getNextToken();
      textContents.push(nextToken.content);
    }

    paragraph.appendChild(this.createTextNode(textContents.join("\n")));

    return paragraph;
  },

  parseText: function (noEmphasis) {
    var lineToken = this.lexer.getNextToken();
    return this.createTextNode(lineToken.content, noEmphasis);
  },

  // ------------------------------------------------------------
  // <Text> (DOM Like)
  // ------------------------------------------------------------

  createTextNode: function (text, noEmphasis) {
    return noEmphasis ? Node.createText(null, { value: text })
      : this.inlineParser.parseEmphasis(text);
  }
};
Parser.prototype.originalParseElement = Parser.prototype.parseElement;

// ------------------------------------------------------------
// Parser for Inline Elements
//
// @refs org-emphasis-regexp-components
// ------------------------------------------------------------

function InlineParser() {
  this.preEmphasis     = " \t\\('\"";
  this.postEmphasis    = "- \t.,:!?;'\"\\)";
  this.borderForbidden = " \t\r\n,\"'";
  this.bodyRegexp      = "[\\s\\S]*?";
  this.markers         = "*/_=~+";

  this.emphasisPattern = this.buildEmphasisPattern();
  this.linkPattern = /\[\[([^\]]*)\](?:\[([^\]]*)\])?\]/g; // \1 => link, \2 => text
}

InlineParser.prototype = {
  parseEmphasis: function (text) {
    var emphasisPattern = this.emphasisPattern;
    emphasisPattern.lastIndex = 0;

    var result = [],
        match,
        previousLast = 0,
        savedLastIndex;

    while ((match = emphasisPattern.exec(text))) {
      var whole  = match[0];
      var pre    = match[1];
      var marker = match[2];
      var body   = match[3];
      var post   = match[4];

      {
        // parse links
        var matchBegin = emphasisPattern.lastIndex - whole.length;
        var beforeContent = text.substring(previousLast, matchBegin + pre.length);
        savedLastIndex = emphasisPattern.lastIndex;
        result.push(this.parseLink(beforeContent));
        emphasisPattern.lastIndex = savedLastIndex;
      }

      var bodyNode = [Node.createText(null, { value: body })];
      var bodyContainer = this.emphasizeElementByMarker(bodyNode, marker);
      result.push(bodyContainer);

      previousLast = emphasisPattern.lastIndex - post.length;
    }

    if (emphasisPattern.lastIndex === 0 ||
        emphasisPattern.lastIndex !== text.length - 1)
      result.push(this.parseLink(text.substring(previousLast)));

    if (result.length === 1) {
      // Avoid duplicated inline container wrapping
      return result[0];
    } else {
      return Node.createInlineContainer(result);
    }
  },

  depth: 0,
  parseLink: function (text) {
    var linkPattern = this.linkPattern;
    linkPattern.lastIndex = 0;

    var match,
        result = [],
        previousLast = 0,
        savedLastIndex;

    while ((match = linkPattern.exec(text))) {
      var whole = match[0];
      var src   = match[1];
      var title = match[2];

      // parse before content
      var matchBegin = linkPattern.lastIndex - whole.length;
      var beforeContent = text.substring(previousLast, matchBegin);
      result.push(Node.createText(null, { value: beforeContent }));

      // parse link
      var link = Node.createLink([]);
      link.src = src;
      if (title) {
        savedLastIndex = linkPattern.lastIndex;
        link.appendChild(this.parseEmphasis(title));
        linkPattern.lastIndex = savedLastIndex;
      } else {
        link.appendChild(Node.createText(null, { value: src }));
      }
      result.push(link);

      previousLast = linkPattern.lastIndex;
    }

    if (linkPattern.lastIndex === 0 ||
        linkPattern.lastIndex !== text.length - 1)
      result.push(Node.createText(null, { value: text.substring(previousLast) }));

    return Node.createInlineContainer(result);
  },

  emphasizeElementByMarker: function (element, marker) {
    switch (marker) {
    case "*":
      return Node.createBold(element);
    case "/":
      return Node.createItalic(element);
    case "_":
      return Node.createUnderline(element);
    case "=":
    case "~":
      return Node.createCode(element);
    case "+":
      return Node.createDashed(element);
    }
  },

  buildEmphasisPattern: function () {
    return new RegExp(
      "([" + this.preEmphasis + "]|^|\r?\n)" +               // \1 => pre
        "([" + this.markers + "])" +                         // \2 => marker
        "([^" + this.borderForbidden + "]|" +                // \3 => body
        "[^" + this.borderForbidden + "]" +
        this.bodyRegexp +
        "[^" + this.borderForbidden + "])" +
        "\\2" +
        "([" + this.postEmphasis +"]|$|\r?\n)",              // \4 => post
        // flags
        "g"
    );
  }
};

if (typeof exports !== "undefined") {
  exports.Parser = Parser;
  exports.InlineParser = InlineParser;
}

},{"./lexer.js":4,"./node.js":5,"./stream.js":7}],7:[function(require,module,exports){
function Stream(sequence) {
  this.sequences = sequence.split(/\r?\n/);
  this.totalLines = this.sequences.length;
  this.lineNumber = 0;
}

Stream.prototype.peekNextLine = function () {
  return this.hasNext() ? this.sequences[this.lineNumber] : null;
};

Stream.prototype.getNextLine = function () {
  return this.hasNext() ? this.sequences[this.lineNumber++] : null;
};

Stream.prototype.hasNext = function () {
  return this.lineNumber < this.totalLines;
};

if (typeof exports !== "undefined") {
  exports.Stream = Stream;
}

},{}],8:[function(require,module,exports){
'use strict';

var _org = require('org');

function main() {
  var parser = new _org.Parser();
  var doc = parser.parse(document.body.innerText).convert(_org.ConverterHTML);

  document.firstChild.className = 'org-viewer';

  document.body.innerHTML = '<div class="page">' + '<h1 class="title"><a href="#">' + doc.title + '</a></h1>' + '<div class="table-of-contents">' + '<h2>Table of contents</h2>' + doc.tocHTML + '</div>' + doc.titleHTML + doc.tocHTML + doc.contentHTML + '</div>';
  document.title = doc.title;
}

if (document.contentType === 'text/plain') {
  main();
}

},{"org":1}]},{},[8])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL0FwcERhdGEvUm9hbWluZy9ucG0vbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi4uLy4uL0FwcERhdGEvUm9hbWluZy9ucG0vbm9kZV9tb2R1bGVzL29yZy9saWIvb3JnLmpzIiwiLi4vLi4vQXBwRGF0YS9Sb2FtaW5nL25wbS9ub2RlX21vZHVsZXMvb3JnL2xpYi9vcmcvY29udmVydGVyL2NvbnZlcnRlci5qcyIsIi4uLy4uL0FwcERhdGEvUm9hbWluZy9ucG0vbm9kZV9tb2R1bGVzL29yZy9saWIvb3JnL2NvbnZlcnRlci9odG1sLmpzIiwiLi4vLi4vQXBwRGF0YS9Sb2FtaW5nL25wbS9ub2RlX21vZHVsZXMvb3JnL2xpYi9vcmcvbGV4ZXIuanMiLCIuLi8uLi9BcHBEYXRhL1JvYW1pbmcvbnBtL25vZGVfbW9kdWxlcy9vcmcvbGliL29yZy9ub2RlLmpzIiwiLi4vLi4vQXBwRGF0YS9Sb2FtaW5nL25wbS9ub2RlX21vZHVsZXMvb3JnL2xpYi9vcmcvcGFyc2VyLmpzIiwiLi4vLi4vQXBwRGF0YS9Sb2FtaW5nL25wbS9ub2RlX21vZHVsZXMvb3JnL2xpYi9vcmcvc3RyZWFtLmpzIiwiYXBwXFxzY3JpcHRzLmJhYmVsXFxpbmplY3RlZC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RZQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3paQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0cUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7QUNuQkEsU0FBUyxJQUFJLEdBQUc7QUFDZCxNQUFNLE1BQU0sR0FBRyxTQUhULE1BQU0sRUFHZSxDQUFDO0FBQzVCLE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxPQUFPLE1BSjNDLGFBQWEsQ0FJNkMsQ0FBQzs7QUFFekUsVUFBUSxDQUFDLFVBQVUsQ0FBQyxTQUFTLEdBQUcsWUFBWSxDQUFDOztBQUU3QyxVQUFRLENBQUMsSUFBSSxDQUFDLFNBQVMsR0FDckIsb0JBQW9CLEdBQ3BCLGdDQUFnQyxHQUFHLEdBQUcsQ0FBQyxLQUFLLEdBQUcsV0FBVyxHQUMxRCxpQ0FBaUMsR0FDakMsNEJBQTRCLEdBQzVCLEdBQUcsQ0FBQyxPQUFPLEdBQ1gsUUFBUSxHQUNSLEdBQUcsQ0FBQyxTQUFTLEdBQ2IsR0FBRyxDQUFDLE9BQU8sR0FDWCxHQUFHLENBQUMsV0FBVyxHQUNmLFFBQVEsQ0FBQztBQUNYLFVBQVEsQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQztDQUM1Qjs7QUFFRCxJQUFJLFFBQVEsQ0FBQyxXQUFXLEtBQUssWUFBWSxFQUFFO0FBQ3pDLE1BQUksRUFBRSxDQUFDO0NBQ1IiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiaWYgKHR5cGVvZiBleHBvcnRzICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gIGZ1bmN0aW9uIGV4cG9ydE1vZHVsZShtb2R1bGUpIHtcbiAgICBmb3IgKHZhciBleHBvcnRlZE5hbWUgaW4gbW9kdWxlKSB7XG4gICAgICBpZiAobW9kdWxlLmhhc093blByb3BlcnR5KGV4cG9ydGVkTmFtZSkpIHtcbiAgICAgICAgZXhwb3J0c1tleHBvcnRlZE5hbWVdID0gbW9kdWxlW2V4cG9ydGVkTmFtZV07XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZXhwb3J0TW9kdWxlKHJlcXVpcmUoXCIuL29yZy9wYXJzZXIuanNcIikpO1xuICBleHBvcnRNb2R1bGUocmVxdWlyZShcIi4vb3JnL2xleGVyLmpzXCIpKTtcbiAgZXhwb3J0TW9kdWxlKHJlcXVpcmUoXCIuL29yZy9ub2RlLmpzXCIpKTtcbiAgZXhwb3J0TW9kdWxlKHJlcXVpcmUoXCIuL29yZy9wYXJzZXIuanNcIikpO1xuICBleHBvcnRNb2R1bGUocmVxdWlyZShcIi4vb3JnL3N0cmVhbS5qc1wiKSk7XG4gIGV4cG9ydE1vZHVsZShyZXF1aXJlKFwiLi9vcmcvY29udmVydGVyL2h0bWwuanNcIikpO1xufVxuIiwidmFyIE5vZGUgPSByZXF1aXJlKFwiLi4vbm9kZS5qc1wiKS5Ob2RlO1xuXG5mdW5jdGlvbiBDb252ZXJ0ZXIoKSB7XG59XG5cbkNvbnZlcnRlci5wcm90b3R5cGUgPSB7XG4gIGV4cG9ydE9wdGlvbnM6IHtcbiAgICBoZWFkZXJPZmZzZXQ6IDEsXG4gICAgZXhwb3J0RnJvbUxpbmVOdW1iZXI6IGZhbHNlLFxuICAgIHN1cHByZXNzU3ViU2NyaXB0SGFuZGxpbmc6IGZhbHNlLFxuICAgIHN1cHByZXNzQXV0b0xpbms6IGZhbHNlLFxuICAgIC8vIEhUTUxcbiAgICB0cmFuc2xhdGVTeW1ib2xBcnJvdzogZmFsc2UsXG4gICAgc3VwcHJlc3NDaGVja2JveEhhbmRsaW5nOiBmYWxzZSxcbiAgICAvLyB7IFwiZGlyZWN0aXZlOlwiOiBmdW5jdGlvbiAobm9kZSwgY2hpbGRUZXh0LCBhdXhEYXRhKSB7fSB9XG4gICAgY3VzdG9tRGlyZWN0aXZlSGFuZGxlcjogbnVsbCxcbiAgICAvLyBlLmcuLCBcIm9yZy1qcy1cIlxuICAgIGh0bWxDbGFzc1ByZWZpeDogbnVsbCxcbiAgICBodG1sSWRQcmVmaXg6IG51bGxcbiAgfSxcblxuICB1bnRpdGxlZDogXCJVbnRpdGxlZFwiLFxuICByZXN1bHQ6IG51bGwsXG5cbiAgLy8gVE9ETzogTWFuYWdlIFRPRE8gbGlzdHNcblxuICBpbml0aWFsaXplOiBmdW5jdGlvbiAob3JnRG9jdW1lbnQsIGV4cG9ydE9wdGlvbnMpIHtcbiAgICB0aGlzLm9yZ0RvY3VtZW50ID0gb3JnRG9jdW1lbnQ7XG4gICAgdGhpcy5kb2N1bWVudE9wdGlvbnMgPSBvcmdEb2N1bWVudC5vcHRpb25zIHx8IHt9O1xuICAgIHRoaXMuZXhwb3J0T3B0aW9ucyA9IGV4cG9ydE9wdGlvbnMgfHwge307XG5cbiAgICB0aGlzLmhlYWRlcnMgPSBbXTtcbiAgICB0aGlzLmhlYWRlck9mZnNldCA9XG4gICAgICB0eXBlb2YgdGhpcy5leHBvcnRPcHRpb25zLmhlYWRlck9mZnNldCA9PT0gXCJudW1iZXJcIiA/IHRoaXMuZXhwb3J0T3B0aW9ucy5oZWFkZXJPZmZzZXQgOiAxO1xuICAgIHRoaXMuc2VjdGlvbk51bWJlcnMgPSBbMF07XG4gIH0sXG5cbiAgY3JlYXRlVG9jSXRlbTogZnVuY3Rpb24gKGhlYWRlck5vZGUsIHBhcmVudFRvY3MpIHtcbiAgICB2YXIgY2hpbGRUb2NzID0gW107XG4gICAgY2hpbGRUb2NzLnBhcmVudCA9IHBhcmVudFRvY3M7XG4gICAgdmFyIHRvY0l0ZW0gPSB7IGhlYWRlck5vZGU6IGhlYWRlck5vZGUsIGNoaWxkVG9jczogY2hpbGRUb2NzIH07XG4gICAgcmV0dXJuIHRvY0l0ZW07XG4gIH0sXG5cbiAgY29tcHV0ZVRvYzogZnVuY3Rpb24gKGV4cG9ydFRvY0xldmVsKSB7XG4gICAgaWYgKHR5cGVvZiBleHBvcnRUb2NMZXZlbCAhPT0gXCJudW1iZXJcIilcbiAgICAgIGV4cG9ydFRvY0xldmVsID0gSW5maW5pdHk7XG5cbiAgICB2YXIgdG9jID0gW107XG4gICAgdG9jLnBhcmVudCA9IG51bGw7XG5cbiAgICB2YXIgcHJldmlvdXNMZXZlbCA9IDE7XG4gICAgdmFyIGN1cnJlbnRUb2NzID0gdG9jOyAgLy8gZmlyc3RcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5oZWFkZXJzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgaGVhZGVyTm9kZSA9IHRoaXMuaGVhZGVyc1tpXTtcblxuICAgICAgaWYgKGhlYWRlck5vZGUubGV2ZWwgPiBleHBvcnRUb2NMZXZlbClcbiAgICAgICAgY29udGludWU7XG5cbiAgICAgIHZhciBsZXZlbERpZmYgPSBoZWFkZXJOb2RlLmxldmVsIC0gcHJldmlvdXNMZXZlbDtcbiAgICAgIGlmIChsZXZlbERpZmYgPiAwKSB7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgbGV2ZWxEaWZmOyArK2opIHtcbiAgICAgICAgICBpZiAoY3VycmVudFRvY3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAvLyBDcmVhdGUgYSBkdW1teSB0b2NJdGVtXG4gICAgICAgICAgICB2YXIgZHVtbXlIZWFkZXIgPSBOb2RlLmNyZWF0ZUhlYWRlcihbXSwge1xuICAgICAgICAgICAgICBsZXZlbDogcHJldmlvdXNMZXZlbCArIGpcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgZHVtbXlIZWFkZXIuc2VjdGlvbk51bWJlclRleHQgPSBcIlwiO1xuICAgICAgICAgICAgY3VycmVudFRvY3MucHVzaCh0aGlzLmNyZWF0ZVRvY0l0ZW0oZHVtbXlIZWFkZXIsIGN1cnJlbnRUb2NzKSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGN1cnJlbnRUb2NzID0gY3VycmVudFRvY3NbY3VycmVudFRvY3MubGVuZ3RoIC0gMV0uY2hpbGRUb2NzO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGxldmVsRGlmZiA8IDApIHtcbiAgICAgICAgbGV2ZWxEaWZmID0gLWxldmVsRGlmZjtcbiAgICAgICAgZm9yICh2YXIgayA9IDA7IGsgPCBsZXZlbERpZmY7ICsraykge1xuICAgICAgICAgIGN1cnJlbnRUb2NzID0gY3VycmVudFRvY3MucGFyZW50O1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGN1cnJlbnRUb2NzLnB1c2godGhpcy5jcmVhdGVUb2NJdGVtKGhlYWRlck5vZGUsIGN1cnJlbnRUb2NzKSk7XG5cbiAgICAgIHByZXZpb3VzTGV2ZWwgPSBoZWFkZXJOb2RlLmxldmVsO1xuICAgIH1cblxuICAgIHJldHVybiB0b2M7XG4gIH0sXG5cbiAgY29udmVydE5vZGU6IGZ1bmN0aW9uIChub2RlLCByZWNvcmRIZWFkZXIsIGluc2lkZUNvZGVFbGVtZW50KSB7XG4gICAgaWYgKCFpbnNpZGVDb2RlRWxlbWVudCkge1xuICAgICAgaWYgKG5vZGUudHlwZSA9PT0gTm9kZS50eXBlcy5kaXJlY3RpdmUpIHtcbiAgICAgICAgaWYgKG5vZGUuZGlyZWN0aXZlTmFtZSA9PT0gXCJleGFtcGxlXCIgfHxcbiAgICAgICAgICAgIG5vZGUuZGlyZWN0aXZlTmFtZSA9PT0gXCJzcmNcIikge1xuICAgICAgICAgIGluc2lkZUNvZGVFbGVtZW50ID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChub2RlLnR5cGUgPT09IE5vZGUudHlwZXMucHJlZm9ybWF0dGVkKSB7XG4gICAgICAgIGluc2lkZUNvZGVFbGVtZW50ID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIG5vZGUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgIG5vZGUgPSBOb2RlLmNyZWF0ZVRleHQobnVsbCwgeyB2YWx1ZTogbm9kZSB9KTtcbiAgICB9XG5cbiAgICB2YXIgY2hpbGRUZXh0ID0gbm9kZS5jaGlsZHJlbiA/IHRoaXMuY29udmVydE5vZGVzSW50ZXJuYWwobm9kZS5jaGlsZHJlbiwgcmVjb3JkSGVhZGVyLCBpbnNpZGVDb2RlRWxlbWVudCkgOiBcIlwiO1xuICAgIHZhciB0ZXh0O1xuXG4gICAgdmFyIGF1eERhdGEgPSB0aGlzLmNvbXB1dGVBdXhEYXRhRm9yTm9kZShub2RlKTtcblxuICAgIHN3aXRjaCAobm9kZS50eXBlKSB7XG4gICAgY2FzZSBOb2RlLnR5cGVzLmhlYWRlcjpcbiAgICAgIC8vIFBhcnNlIHRhc2sgc3RhdHVzXG4gICAgICB2YXIgdGFza1N0YXR1cyA9IG51bGw7XG4gICAgICBpZiAoY2hpbGRUZXh0LmluZGV4T2YoXCJUT0RPIFwiKSA9PT0gMClcbiAgICAgICAgdGFza1N0YXR1cyA9IFwidG9kb1wiO1xuICAgICAgZWxzZSBpZiAoY2hpbGRUZXh0LmluZGV4T2YoXCJET05FIFwiKSA9PT0gMClcbiAgICAgICAgdGFza1N0YXR1cyA9IFwiZG9uZVwiO1xuXG4gICAgICAvLyBDb21wdXRlIHNlY3Rpb24gbnVtYmVyXG4gICAgICB2YXIgc2VjdGlvbk51bWJlclRleHQgPSBudWxsO1xuICAgICAgaWYgKHJlY29yZEhlYWRlcikge1xuICAgICAgICB2YXIgdGhpc0hlYWRlckxldmVsID0gbm9kZS5sZXZlbDtcbiAgICAgICAgdmFyIHByZXZpb3VzSGVhZGVyTGV2ZWwgPSB0aGlzLnNlY3Rpb25OdW1iZXJzLmxlbmd0aDtcbiAgICAgICAgaWYgKHRoaXNIZWFkZXJMZXZlbCA+IHByZXZpb3VzSGVhZGVyTGV2ZWwpIHtcbiAgICAgICAgICAvLyBGaWxsIG1pc3Npbmcgc2VjdGlvbiBudW1iZXJcbiAgICAgICAgICB2YXIgbGV2ZWxEaWZmID0gdGhpc0hlYWRlckxldmVsIC0gcHJldmlvdXNIZWFkZXJMZXZlbDtcbiAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGxldmVsRGlmZjsgKytqKSB7XG4gICAgICAgICAgICB0aGlzLnNlY3Rpb25OdW1iZXJzW3RoaXNIZWFkZXJMZXZlbCAtIDEgLSBqXSA9IDA7IC8vIEV4dGVuZFxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICh0aGlzSGVhZGVyTGV2ZWwgPCBwcmV2aW91c0hlYWRlckxldmVsKSB7XG4gICAgICAgICAgdGhpcy5zZWN0aW9uTnVtYmVycy5sZW5ndGggPSB0aGlzSGVhZGVyTGV2ZWw7IC8vIENvbGxhcHNlXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zZWN0aW9uTnVtYmVyc1t0aGlzSGVhZGVyTGV2ZWwgLSAxXSsrO1xuICAgICAgICBzZWN0aW9uTnVtYmVyVGV4dCA9IHRoaXMuc2VjdGlvbk51bWJlcnMuam9pbihcIi5cIik7XG4gICAgICAgIG5vZGUuc2VjdGlvbk51bWJlclRleHQgPSBzZWN0aW9uTnVtYmVyVGV4dDsgLy8gQ2FuIGJlIHVzZWQgaW4gVG9DXG4gICAgICB9XG5cbiAgICAgIHRleHQgPSB0aGlzLmNvbnZlcnRIZWFkZXIobm9kZSwgY2hpbGRUZXh0LCBhdXhEYXRhLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YXNrU3RhdHVzLCBzZWN0aW9uTnVtYmVyVGV4dCk7XG5cbiAgICAgIGlmIChyZWNvcmRIZWFkZXIpXG4gICAgICAgIHRoaXMuaGVhZGVycy5wdXNoKG5vZGUpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBOb2RlLnR5cGVzLm9yZGVyZWRMaXN0OlxuICAgICAgdGV4dCA9IHRoaXMuY29udmVydE9yZGVyZWRMaXN0KG5vZGUsIGNoaWxkVGV4dCwgYXV4RGF0YSk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIE5vZGUudHlwZXMudW5vcmRlcmVkTGlzdDpcbiAgICAgIHRleHQgPSB0aGlzLmNvbnZlcnRVbm9yZGVyZWRMaXN0KG5vZGUsIGNoaWxkVGV4dCwgYXV4RGF0YSk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIE5vZGUudHlwZXMuZGVmaW5pdGlvbkxpc3Q6XG4gICAgICB0ZXh0ID0gdGhpcy5jb252ZXJ0RGVmaW5pdGlvbkxpc3Qobm9kZSwgY2hpbGRUZXh0LCBhdXhEYXRhKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgTm9kZS50eXBlcy5saXN0RWxlbWVudDpcbiAgICAgIGlmIChub2RlLmlzRGVmaW5pdGlvbkxpc3QpIHtcbiAgICAgICAgdmFyIHRlcm1UZXh0ID0gdGhpcy5jb252ZXJ0Tm9kZXNJbnRlcm5hbChub2RlLnRlcm0sIHJlY29yZEhlYWRlciwgaW5zaWRlQ29kZUVsZW1lbnQpO1xuICAgICAgICB0ZXh0ID0gdGhpcy5jb252ZXJ0RGVmaW5pdGlvbkl0ZW0obm9kZSwgY2hpbGRUZXh0LCBhdXhEYXRhLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGVybVRleHQsIGNoaWxkVGV4dCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0ZXh0ID0gdGhpcy5jb252ZXJ0TGlzdEl0ZW0obm9kZSwgY2hpbGRUZXh0LCBhdXhEYXRhKTtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgTm9kZS50eXBlcy5wYXJhZ3JhcGg6XG4gICAgICB0ZXh0ID0gdGhpcy5jb252ZXJ0UGFyYWdyYXBoKG5vZGUsIGNoaWxkVGV4dCwgYXV4RGF0YSk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIE5vZGUudHlwZXMucHJlZm9ybWF0dGVkOlxuICAgICAgdGV4dCA9IHRoaXMuY29udmVydFByZWZvcm1hdHRlZChub2RlLCBjaGlsZFRleHQsIGF1eERhdGEpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBOb2RlLnR5cGVzLnRhYmxlOlxuICAgICAgdGV4dCA9IHRoaXMuY29udmVydFRhYmxlKG5vZGUsIGNoaWxkVGV4dCwgYXV4RGF0YSk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIE5vZGUudHlwZXMudGFibGVSb3c6XG4gICAgICB0ZXh0ID0gdGhpcy5jb252ZXJ0VGFibGVSb3cobm9kZSwgY2hpbGRUZXh0LCBhdXhEYXRhKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgTm9kZS50eXBlcy50YWJsZUNlbGw6XG4gICAgICBpZiAobm9kZS5pc0hlYWRlcilcbiAgICAgICAgdGV4dCA9IHRoaXMuY29udmVydFRhYmxlSGVhZGVyKG5vZGUsIGNoaWxkVGV4dCwgYXV4RGF0YSk7XG4gICAgICBlbHNlXG4gICAgICAgIHRleHQgPSB0aGlzLmNvbnZlcnRUYWJsZUNlbGwobm9kZSwgY2hpbGRUZXh0LCBhdXhEYXRhKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgTm9kZS50eXBlcy5ob3Jpem9udGFsUnVsZTpcbiAgICAgIHRleHQgPSB0aGlzLmNvbnZlcnRIb3Jpem9udGFsUnVsZShub2RlLCBjaGlsZFRleHQsIGF1eERhdGEpO1xuICAgICAgYnJlYWs7XG4gICAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0gLy9cbiAgICAgIC8vIElubGluZVxuICAgICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09IC8vXG4gICAgY2FzZSBOb2RlLnR5cGVzLmlubGluZUNvbnRhaW5lcjpcbiAgICAgIHRleHQgPSB0aGlzLmNvbnZlcnRJbmxpbmVDb250YWluZXIobm9kZSwgY2hpbGRUZXh0LCBhdXhEYXRhKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgTm9kZS50eXBlcy5ib2xkOlxuICAgICAgdGV4dCA9IHRoaXMuY29udmVydEJvbGQobm9kZSwgY2hpbGRUZXh0LCBhdXhEYXRhKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgTm9kZS50eXBlcy5pdGFsaWM6XG4gICAgICB0ZXh0ID0gdGhpcy5jb252ZXJ0SXRhbGljKG5vZGUsIGNoaWxkVGV4dCwgYXV4RGF0YSk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIE5vZGUudHlwZXMudW5kZXJsaW5lOlxuICAgICAgdGV4dCA9IHRoaXMuY29udmVydFVuZGVybGluZShub2RlLCBjaGlsZFRleHQsIGF1eERhdGEpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBOb2RlLnR5cGVzLmNvZGU6XG4gICAgICB0ZXh0ID0gdGhpcy5jb252ZXJ0Q29kZShub2RlLCBjaGlsZFRleHQsIGF1eERhdGEpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBOb2RlLnR5cGVzLmRhc2hlZDpcbiAgICAgIHRleHQgPSB0aGlzLmNvbnZlcnREYXNoZWQobm9kZSwgY2hpbGRUZXh0LCBhdXhEYXRhKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgTm9kZS50eXBlcy5saW5rOlxuICAgICAgdGV4dCA9IHRoaXMuY29udmVydExpbmsobm9kZSwgY2hpbGRUZXh0LCBhdXhEYXRhKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgTm9kZS50eXBlcy5kaXJlY3RpdmU6XG4gICAgICBzd2l0Y2ggKG5vZGUuZGlyZWN0aXZlTmFtZSkge1xuICAgICAgY2FzZSBcInF1b3RlXCI6XG4gICAgICAgIHRleHQgPSB0aGlzLmNvbnZlcnRRdW90ZShub2RlLCBjaGlsZFRleHQsIGF1eERhdGEpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJleGFtcGxlXCI6XG4gICAgICAgIHRleHQgPSB0aGlzLmNvbnZlcnRFeGFtcGxlKG5vZGUsIGNoaWxkVGV4dCwgYXV4RGF0YSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInNyY1wiOlxuICAgICAgICB0ZXh0ID0gdGhpcy5jb252ZXJ0U3JjKG5vZGUsIGNoaWxkVGV4dCwgYXV4RGF0YSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcImh0bWxcIjpcbiAgICAgIGNhc2UgXCJodG1sOlwiOlxuICAgICAgICB0ZXh0ID0gdGhpcy5jb252ZXJ0SFRNTChub2RlLCBjaGlsZFRleHQsIGF1eERhdGEpO1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGlmICh0aGlzLmV4cG9ydE9wdGlvbnMuY3VzdG9tRGlyZWN0aXZlSGFuZGxlciAmJlxuICAgICAgICAgICAgdGhpcy5leHBvcnRPcHRpb25zLmN1c3RvbURpcmVjdGl2ZUhhbmRsZXJbbm9kZS5kaXJlY3RpdmVOYW1lXSkge1xuICAgICAgICAgIHRleHQgPSB0aGlzLmV4cG9ydE9wdGlvbnMuY3VzdG9tRGlyZWN0aXZlSGFuZGxlcltub2RlLmRpcmVjdGl2ZU5hbWVdKFxuICAgICAgICAgICAgbm9kZSwgY2hpbGRUZXh0LCBhdXhEYXRhXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0ZXh0ID0gY2hpbGRUZXh0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlIE5vZGUudHlwZXMudGV4dDpcbiAgICAgIHRleHQgPSB0aGlzLmNvbnZlcnRUZXh0KG5vZGUudmFsdWUsIGluc2lkZUNvZGVFbGVtZW50KTtcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBFcnJvcihcIlVua25vd24gbm9kZSB0eXBlOiBcIiArIG5vZGUudHlwZSk7XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiB0aGlzLnBvc3RQcm9jZXNzID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgIHRleHQgPSB0aGlzLnBvc3RQcm9jZXNzKG5vZGUsIHRleHQsIGluc2lkZUNvZGVFbGVtZW50KTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGV4dDtcbiAgfSxcblxuICBjb252ZXJ0VGV4dDogZnVuY3Rpb24gKHRleHQsIGluc2lkZUNvZGVFbGVtZW50KSB7XG4gICAgdmFyIGVzY2FwZWRUZXh0ID0gdGhpcy5lc2NhcGVTcGVjaWFsQ2hhcnModGV4dCwgaW5zaWRlQ29kZUVsZW1lbnQpO1xuXG4gICAgaWYgKCF0aGlzLmV4cG9ydE9wdGlvbnMuc3VwcHJlc3NTdWJTY3JpcHRIYW5kbGluZyAmJiAhaW5zaWRlQ29kZUVsZW1lbnQpIHtcbiAgICAgIGVzY2FwZWRUZXh0ID0gdGhpcy5tYWtlU3Vic2NyaXB0cyhlc2NhcGVkVGV4dCwgaW5zaWRlQ29kZUVsZW1lbnQpO1xuICAgIH1cbiAgICBpZiAoIXRoaXMuZXhwb3J0T3B0aW9ucy5zdXBwcmVzc0F1dG9MaW5rKSB7XG4gICAgICBlc2NhcGVkVGV4dCA9IHRoaXMubGlua1VSTChlc2NhcGVkVGV4dCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGVzY2FwZWRUZXh0O1xuICB9LFxuXG4gIC8vIEJ5IGRlZmF1bHQsIGlnbm9yZSBodG1sXG4gIGNvbnZlcnRIVE1MOiBmdW5jdGlvbiAobm9kZSwgY2hpbGRUZXh0LCBhdXhEYXRhKSB7XG4gICAgcmV0dXJuIGNoaWxkVGV4dDtcbiAgfSxcblxuICBjb252ZXJ0Tm9kZXNJbnRlcm5hbDogZnVuY3Rpb24gKG5vZGVzLCByZWNvcmRIZWFkZXIsIGluc2lkZUNvZGVFbGVtZW50KSB7XG4gICAgdmFyIG5vZGVzVGV4dHMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5vZGVzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgbm9kZSA9IG5vZGVzW2ldO1xuICAgICAgdmFyIG5vZGVUZXh0ID0gdGhpcy5jb252ZXJ0Tm9kZShub2RlLCByZWNvcmRIZWFkZXIsIGluc2lkZUNvZGVFbGVtZW50KTtcbiAgICAgIG5vZGVzVGV4dHMucHVzaChub2RlVGV4dCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmNvbWJpbmVOb2Rlc1RleHRzKG5vZGVzVGV4dHMpO1xuICB9LFxuXG4gIGNvbnZlcnRIZWFkZXJCbG9jazogZnVuY3Rpb24gKGhlYWRlckJsb2NrLCByZWNvcmRIZWFkZXIpIHtcbiAgICB0aHJvdyBFcnJvcihcImNvbnZlcnRIZWFkZXJCbG9jayBpcyBub3QgaW1wbGVtZW50ZWRcIik7XG4gIH0sXG5cbiAgY29udmVydEhlYWRlclRyZWU6IGZ1bmN0aW9uIChoZWFkZXJUcmVlLCByZWNvcmRIZWFkZXIpIHtcbiAgICByZXR1cm4gdGhpcy5jb252ZXJ0SGVhZGVyQmxvY2soaGVhZGVyVHJlZSwgcmVjb3JkSGVhZGVyKTtcbiAgfSxcblxuICBjb252ZXJ0Tm9kZXNUb0hlYWRlclRyZWU6IGZ1bmN0aW9uIChub2RlcywgbmV4dEJsb2NrQmVnaW4sIGJsb2NrSGVhZGVyKSB7XG4gICAgdmFyIGNoaWxkQmxvY2tzID0gW107XG4gICAgdmFyIGNoaWxkTm9kZXMgPSBbXTtcblxuICAgIGlmICh0eXBlb2YgbmV4dEJsb2NrQmVnaW4gPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIG5leHRCbG9ja0JlZ2luID0gMDtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBibG9ja0hlYWRlciA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgYmxvY2tIZWFkZXIgPSBudWxsO1xuICAgIH1cblxuICAgIGZvciAodmFyIGkgPSBuZXh0QmxvY2tCZWdpbjsgaSA8IG5vZGVzLmxlbmd0aDspIHtcbiAgICAgIHZhciBub2RlID0gbm9kZXNbaV07XG5cbiAgICAgIHZhciBpc0hlYWRlciA9IG5vZGUudHlwZSA9PT0gTm9kZS50eXBlcy5oZWFkZXI7XG5cbiAgICAgIGlmICghaXNIZWFkZXIpIHtcbiAgICAgICAgY2hpbGROb2Rlcy5wdXNoKG5vZGUpO1xuICAgICAgICBpID0gaSArIDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBIZWFkZXJcbiAgICAgIGlmIChibG9ja0hlYWRlciAmJiBub2RlLmxldmVsIDw9IGJsb2NrSGVhZGVyLmxldmVsKSB7XG4gICAgICAgIC8vIEZpbmlzaCBCbG9ja1xuICAgICAgICBicmVhaztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIGJsb2NrSGVhZGVyLmxldmVsIDwgbm9kZS5sZXZlbFxuICAgICAgICAvLyBCZWdpbiBjaGlsZCBibG9ja1xuICAgICAgICB2YXIgY2hpbGRCbG9jayA9IHRoaXMuY29udmVydE5vZGVzVG9IZWFkZXJUcmVlKG5vZGVzLCBpICsgMSwgbm9kZSk7XG4gICAgICAgIGNoaWxkQmxvY2tzLnB1c2goY2hpbGRCbG9jayk7XG4gICAgICAgIGkgPSBjaGlsZEJsb2NrLm5leHRJbmRleDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBGaW5pc2ggYmxvY2tcbiAgICByZXR1cm4ge1xuICAgICAgaGVhZGVyOiBibG9ja0hlYWRlcixcbiAgICAgIGNoaWxkTm9kZXM6IGNoaWxkTm9kZXMsXG4gICAgICBuZXh0SW5kZXg6IGksXG4gICAgICBjaGlsZEJsb2NrczogY2hpbGRCbG9ja3NcbiAgICB9O1xuICB9LFxuXG4gIGNvbnZlcnROb2RlczogZnVuY3Rpb24gKG5vZGVzLCByZWNvcmRIZWFkZXIsIGluc2lkZUNvZGVFbGVtZW50KSB7XG4gICAgcmV0dXJuIHRoaXMuY29udmVydE5vZGVzSW50ZXJuYWwobm9kZXMsIHJlY29yZEhlYWRlciwgaW5zaWRlQ29kZUVsZW1lbnQpO1xuICB9LFxuXG4gIGNvbWJpbmVOb2Rlc1RleHRzOiBmdW5jdGlvbiAobm9kZXNUZXh0cykge1xuICAgIHJldHVybiBub2Rlc1RleHRzLmpvaW4oXCJcIik7XG4gIH0sXG5cbiAgZ2V0Tm9kZVRleHRDb250ZW50OiBmdW5jdGlvbiAobm9kZSkge1xuICAgIGlmIChub2RlLnR5cGUgPT09IE5vZGUudHlwZXMudGV4dClcbiAgICAgIHJldHVybiB0aGlzLmVzY2FwZVNwZWNpYWxDaGFycyhub2RlLnZhbHVlKTtcbiAgICBlbHNlXG4gICAgICByZXR1cm4gbm9kZS5jaGlsZHJlbiA/IG5vZGUuY2hpbGRyZW4ubWFwKHRoaXMuZ2V0Tm9kZVRleHRDb250ZW50LCB0aGlzKS5qb2luKFwiXCIpIDogXCJcIjtcbiAgfSxcblxuICAvLyBAT3ZlcnJpZGVcbiAgZXNjYXBlU3BlY2lhbENoYXJzOiBmdW5jdGlvbiAodGV4dCkge1xuICAgIHRocm93IEVycm9yKFwiSW1wbGVtZW50IGVzY2FwZVNwZWNpYWxDaGFyc1wiKTtcbiAgfSxcblxuICAvLyBodHRwOi8vZGFyaW5nZmlyZWJhbGwubmV0LzIwMTAvMDcvaW1wcm92ZWRfcmVnZXhfZm9yX21hdGNoaW5nX3VybHNcbiAgdXJsUGF0dGVybjogL1xcYig/Omh0dHBzPzpcXC9cXC98d3d3XFxkezAsM31bLl18W2EtejAtOS5cXC1dK1suXVthLXpdezIsNH1cXC8pKD86W15cXHMoKTw+XSt8XFwoKFteXFxzKCk8Pl0rfChcXChbXlxccygpPD5dK1xcKSkpKlxcKSkrKD86XFwoKFteXFxzKCk8Pl0rfChcXChbXlxccygpPD5dK1xcKSkpKlxcKXxbXlxcc2AhKClcXFtcXF17fTs6J1wiLiw8Pj/Cq8K74oCc4oCd4oCY4oCZXSkvaWcsXG5cbiAgLy8gQE92ZXJyaWRlXG4gIGxpbmtVUkw6IGZ1bmN0aW9uICh0ZXh0KSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiB0ZXh0LnJlcGxhY2UodGhpcy51cmxQYXR0ZXJuLCBmdW5jdGlvbiAobWF0Y2hlZCkge1xuICAgICAgaWYgKG1hdGNoZWQuaW5kZXhPZihcIjovL1wiKSA8IDApXG4gICAgICAgIG1hdGNoZWQgPSBcImh0dHA6Ly9cIiArIG1hdGNoZWQ7XG4gICAgICByZXR1cm4gc2VsZi5tYWtlTGluayhtYXRjaGVkKTtcbiAgICB9KTtcbiAgfSxcblxuICBtYWtlTGluazogZnVuY3Rpb24gKHVybCkge1xuICAgIHRocm93IEVycm9yKFwiSW1wbGVtZW50IG1ha2VMaW5rXCIpO1xuICB9LFxuXG4gIG1ha2VTdWJzY3JpcHRzOiBmdW5jdGlvbiAodGV4dCkge1xuICAgIGlmICh0aGlzLmRvY3VtZW50T3B0aW9uc1tcIl5cIl0gPT09IFwie31cIilcbiAgICAgIHJldHVybiB0ZXh0LnJlcGxhY2UoL1xcYihbXl8gXFx0XSopX3soW159XSopfS9nLFxuICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm1ha2VTdWJzY3JpcHQpO1xuICAgIGVsc2UgaWYgKHRoaXMuZG9jdW1lbnRPcHRpb25zW1wiXlwiXSlcbiAgICAgIHJldHVybiB0ZXh0LnJlcGxhY2UoL1xcYihbXl8gXFx0XSopXyhbXl9dKilcXGIvZyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5tYWtlU3Vic2NyaXB0KTtcbiAgICBlbHNlXG4gICAgICByZXR1cm4gdGV4dDtcbiAgfSxcblxuICBtYWtlU3Vic2NyaXB0OiBmdW5jdGlvbiAobWF0Y2gsIGJvZHksIHN1YnNjcmlwdCkge1xuICAgIHRocm93IEVycm9yKFwiSW1wbGVtZW50IG1ha2VTdWJzY3JpcHRcIik7XG4gIH0sXG5cbiAgc3RyaXBQYXJhbWV0ZXJzRnJvbVVSTDogZnVuY3Rpb24gKHVybCkge1xuICAgIHJldHVybiB1cmwucmVwbGFjZSgvXFw/LiokLywgXCJcIik7XG4gIH0sXG5cbiAgaW1hZ2VFeHRlbnNpb25QYXR0ZXJuOiBuZXcgUmVnRXhwKFwiKFwiICsgW1xuICAgIFwiYm1wXCIsIFwicG5nXCIsIFwianBlZ1wiLCBcImpwZ1wiLCBcImdpZlwiLCBcInRpZmZcIixcbiAgICBcInRpZlwiLCBcInhibVwiLCBcInhwbVwiLCBcInBibVwiLCBcInBnbVwiLCBcInBwbVwiLCBcInN2Z1wiXG4gIF0uam9pbihcInxcIikgKyBcIikkXCIsIFwiaVwiKVxufTtcblxuaWYgKHR5cGVvZiBleHBvcnRzICE9PSBcInVuZGVmaW5lZFwiKVxuICBleHBvcnRzLkNvbnZlcnRlciA9IENvbnZlcnRlcjtcbiIsInZhciBDb252ZXJ0ZXIgPSByZXF1aXJlKFwiLi9jb252ZXJ0ZXIuanNcIikuQ29udmVydGVyO1xudmFyIE5vZGUgPSByZXF1aXJlKFwiLi4vbm9kZS5qc1wiKS5Ob2RlO1xuXG5mdW5jdGlvbiBDb252ZXJ0ZXJIVE1MKG9yZ0RvY3VtZW50LCBleHBvcnRPcHRpb25zKSB7XG4gIHRoaXMuaW5pdGlhbGl6ZShvcmdEb2N1bWVudCwgZXhwb3J0T3B0aW9ucyk7XG4gIHRoaXMucmVzdWx0ID0gdGhpcy5jb252ZXJ0KCk7XG59XG5cbkNvbnZlcnRlckhUTUwucHJvdG90eXBlID0ge1xuICBfX3Byb3RvX186IENvbnZlcnRlci5wcm90b3R5cGUsXG5cbiAgY29udmVydDogZnVuY3Rpb24gKCkge1xuICAgIHZhciB0aXRsZSA9IHRoaXMub3JnRG9jdW1lbnQudGl0bGUgPyB0aGlzLmNvbnZlcnROb2RlKHRoaXMub3JnRG9jdW1lbnQudGl0bGUpIDogdGhpcy51bnRpdGxlZDtcbiAgICB2YXIgdGl0bGVIVE1MID0gdGhpcy50YWcoXCJoXCIgKyBNYXRoLm1heChOdW1iZXIodGhpcy5oZWFkZXJPZmZzZXQpLCAxKSwgdGl0bGUpO1xuICAgIHZhciBjb250ZW50SFRNTCA9IHRoaXMuY29udmVydE5vZGVzKHRoaXMub3JnRG9jdW1lbnQubm9kZXMsIHRydWUgLyogcmVjb3JkIGhlYWRlcnMgKi8pO1xuICAgIHZhciB0b2MgPSB0aGlzLmNvbXB1dGVUb2ModGhpcy5kb2N1bWVudE9wdGlvbnNbXCJ0b2NcIl0pO1xuICAgIHZhciB0b2NIVE1MID0gdGhpcy50b2NUb0hUTUwodG9jKTtcblxuICAgIHJldHVybiB7XG4gICAgICB0aXRsZTogdGl0bGUsXG4gICAgICB0aXRsZUhUTUw6IHRpdGxlSFRNTCxcbiAgICAgIGNvbnRlbnRIVE1MOiBjb250ZW50SFRNTCxcbiAgICAgIHRvY0hUTUw6IHRvY0hUTUwsXG4gICAgICB0b2M6IHRvYyxcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aXRsZUhUTUwgKyB0b2NIVE1MICsgXCJcXG5cIiArIGNvbnRlbnRIVE1MO1xuICAgICAgfVxuICAgIH07XG4gIH0sXG5cbiAgdG9jVG9IVE1MOiBmdW5jdGlvbiAodG9jKSB7XG4gICAgZnVuY3Rpb24gdG9jVG9IVE1MRnVuY3Rpb24odG9jTGlzdCkge1xuICAgICAgdmFyIGh0bWwgPSBcIlwiO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0b2NMaXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciB0b2NJdGVtID0gdG9jTGlzdFtpXTtcbiAgICAgICAgdmFyIHNlY3Rpb25OdW1iZXJUZXh0ID0gdG9jSXRlbS5oZWFkZXJOb2RlLnNlY3Rpb25OdW1iZXJUZXh0O1xuICAgICAgICB2YXIgc2VjdGlvbk51bWJlciA9IHRoaXMuZG9jdW1lbnRPcHRpb25zLm51bSA/XG4gICAgICAgICAgICAgIHRoaXMuaW5saW5lVGFnKFwic3BhblwiLCBzZWN0aW9uTnVtYmVyVGV4dCwge1xuICAgICAgICAgICAgICAgIFwiY2xhc3NcIjogXCJzZWN0aW9uLW51bWJlclwiXG4gICAgICAgICAgICAgIH0pIDogXCJcIjtcbiAgICAgICAgdmFyIGhlYWRlciA9IHRoaXMuZ2V0Tm9kZVRleHRDb250ZW50KHRvY0l0ZW0uaGVhZGVyTm9kZSk7XG4gICAgICAgIHZhciBoZWFkZXJMaW5rID0gdGhpcy5pbmxpbmVUYWcoXCJhXCIsIHNlY3Rpb25OdW1iZXIgKyBoZWFkZXIsIHtcbiAgICAgICAgICBocmVmOiBcIiNoZWFkZXItXCIgKyBzZWN0aW9uTnVtYmVyVGV4dC5yZXBsYWNlKC9cXC4vZywgXCItXCIpXG4gICAgICAgIH0pO1xuICAgICAgICB2YXIgc3ViTGlzdCA9IHRvY0l0ZW0uY2hpbGRUb2NzLmxlbmd0aCA/IHRvY1RvSFRNTEZ1bmN0aW9uLmNhbGwodGhpcywgdG9jSXRlbS5jaGlsZFRvY3MpIDogXCJcIjtcbiAgICAgICAgaHRtbCArPSB0aGlzLnRhZyhcImxpXCIsIGhlYWRlckxpbmsgKyBzdWJMaXN0KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGlzLnRhZyhcInVsXCIsIGh0bWwpO1xuICAgIH1cblxuICAgIHJldHVybiB0b2NUb0hUTUxGdW5jdGlvbi5jYWxsKHRoaXMsIHRvYyk7XG4gIH0sXG5cbiAgY29tcHV0ZUF1eERhdGFGb3JOb2RlOiBmdW5jdGlvbiAobm9kZSkge1xuICAgIHdoaWxlIChub2RlLnBhcmVudCAmJlxuICAgICAgICAgICBub2RlLnBhcmVudC50eXBlID09PSBOb2RlLnR5cGVzLmlubGluZUNvbnRhaW5lcikge1xuICAgICAgbm9kZSA9IG5vZGUucGFyZW50O1xuICAgIH1cbiAgICB2YXIgYXR0cmlidXRlc05vZGUgPSBub2RlLnByZXZpb3VzU2libGluZztcbiAgICB2YXIgYXR0cmlidXRlc1RleHQgPSBcIlwiO1xuICAgIHdoaWxlIChhdHRyaWJ1dGVzTm9kZSAmJlxuICAgICAgICAgICBhdHRyaWJ1dGVzTm9kZS50eXBlID09PSBOb2RlLnR5cGVzLmRpcmVjdGl2ZSAmJlxuICAgICAgICAgICBhdHRyaWJ1dGVzTm9kZS5kaXJlY3RpdmVOYW1lID09PSBcImF0dHJfaHRtbDpcIikge1xuICAgICAgYXR0cmlidXRlc1RleHQgKz0gYXR0cmlidXRlc05vZGUuZGlyZWN0aXZlUmF3VmFsdWUgKyBcIiBcIjtcbiAgICAgIGF0dHJpYnV0ZXNOb2RlID0gYXR0cmlidXRlc05vZGUucHJldmlvdXNTaWJsaW5nO1xuICAgIH1cbiAgICByZXR1cm4gYXR0cmlidXRlc1RleHQ7XG4gIH0sXG5cbiAgLy8gTWV0aG9kIHRvIGNvbnN0cnVjdCBvcmctanMgZ2VuZXJhdGVkIGNsYXNzXG4gIG9yZ0NsYXNzTmFtZTogZnVuY3Rpb24gKGNsYXNzTmFtZSkge1xuICAgIHJldHVybiB0aGlzLmV4cG9ydE9wdGlvbnMuaHRtbENsYXNzUHJlZml4ID9cbiAgICAgIHRoaXMuZXhwb3J0T3B0aW9ucy5odG1sQ2xhc3NQcmVmaXggKyBjbGFzc05hbWVcbiAgICAgIDogY2xhc3NOYW1lO1xuICB9LFxuXG4gIC8vIE1ldGhvZCB0byBjb25zdHJ1Y3Qgb3JnLWpzIGdlbmVyYXRlZCBpZFxuICBvcmdJZDogZnVuY3Rpb24gKGlkKSB7XG4gICAgcmV0dXJuIHRoaXMuZXhwb3J0T3B0aW9ucy5odG1sSWRQcmVmaXggP1xuICAgICAgdGhpcy5leHBvcnRPcHRpb25zLmh0bWxJZFByZWZpeCArIGlkXG4gICAgICA6IGlkO1xuICB9LFxuXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gTm9kZSBjb252ZXJzaW9uXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICBjb252ZXJ0SGVhZGVyOiBmdW5jdGlvbiAobm9kZSwgY2hpbGRUZXh0LCBhdXhEYXRhLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFza1N0YXR1cywgc2VjdGlvbk51bWJlclRleHQpIHtcbiAgICB2YXIgaGVhZGVyQXR0cmlidXRlcyA9IHt9O1xuXG4gICAgaWYgKHRhc2tTdGF0dXMpIHtcbiAgICAgIGNoaWxkVGV4dCA9IHRoaXMuaW5saW5lVGFnKFwic3BhblwiLCBjaGlsZFRleHQuc3Vic3RyaW5nKDAsIDQpLCB7XG4gICAgICAgIFwiY2xhc3NcIjogXCJ0YXNrLXN0YXR1cyBcIiArIHRhc2tTdGF0dXNcbiAgICAgIH0pICsgY2hpbGRUZXh0LnN1YnN0cmluZyg1KTtcbiAgICB9XG5cbiAgICBpZiAoc2VjdGlvbk51bWJlclRleHQpIHtcbiAgICAgIGNoaWxkVGV4dCA9IHRoaXMuaW5saW5lVGFnKFwic3BhblwiLCBzZWN0aW9uTnVtYmVyVGV4dCwge1xuICAgICAgICBcImNsYXNzXCI6IFwic2VjdGlvbi1udW1iZXJcIlxuICAgICAgfSkgKyBjaGlsZFRleHQ7XG4gICAgICBoZWFkZXJBdHRyaWJ1dGVzW1wiaWRcIl0gPSBcImhlYWRlci1cIiArIHNlY3Rpb25OdW1iZXJUZXh0LnJlcGxhY2UoL1xcLi9nLCBcIi1cIik7XG4gICAgfVxuXG4gICAgaWYgKHRhc2tTdGF0dXMpXG4gICAgICBoZWFkZXJBdHRyaWJ1dGVzW1wiY2xhc3NcIl0gPSBcInRhc2stc3RhdHVzIFwiICsgdGFza1N0YXR1cztcblxuICAgIHJldHVybiB0aGlzLnRhZyhcImhcIiArICh0aGlzLmhlYWRlck9mZnNldCArIG5vZGUubGV2ZWwpLFxuICAgICAgICAgICAgICAgICAgICBjaGlsZFRleHQsIGhlYWRlckF0dHJpYnV0ZXMsIGF1eERhdGEpO1xuICB9LFxuXG4gIGNvbnZlcnRPcmRlcmVkTGlzdDogZnVuY3Rpb24gKG5vZGUsIGNoaWxkVGV4dCwgYXV4RGF0YSkge1xuICAgIHJldHVybiB0aGlzLnRhZyhcIm9sXCIsIGNoaWxkVGV4dCwgbnVsbCwgYXV4RGF0YSk7XG4gIH0sXG5cbiAgY29udmVydFVub3JkZXJlZExpc3Q6IGZ1bmN0aW9uIChub2RlLCBjaGlsZFRleHQsIGF1eERhdGEpIHtcbiAgICByZXR1cm4gdGhpcy50YWcoXCJ1bFwiLCBjaGlsZFRleHQsIG51bGwsIGF1eERhdGEpO1xuICB9LFxuXG4gIGNvbnZlcnREZWZpbml0aW9uTGlzdDogZnVuY3Rpb24gKG5vZGUsIGNoaWxkVGV4dCwgYXV4RGF0YSkge1xuICAgIHJldHVybiB0aGlzLnRhZyhcImRsXCIsIGNoaWxkVGV4dCwgbnVsbCwgYXV4RGF0YSk7XG4gIH0sXG5cbiAgY29udmVydERlZmluaXRpb25JdGVtOiBmdW5jdGlvbiAobm9kZSwgY2hpbGRUZXh0LCBhdXhEYXRhLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZXJtLCBkZWZpbml0aW9uKSB7XG4gICAgcmV0dXJuIHRoaXMudGFnKFwiZHRcIiwgdGVybSkgKyB0aGlzLnRhZyhcImRkXCIsIGRlZmluaXRpb24pO1xuICB9LFxuXG4gIGNvbnZlcnRMaXN0SXRlbTogZnVuY3Rpb24gKG5vZGUsIGNoaWxkVGV4dCwgYXV4RGF0YSkge1xuICAgIGlmICh0aGlzLmV4cG9ydE9wdGlvbnMuc3VwcHJlc3NDaGVja2JveEhhbmRsaW5nKSB7XG4gICAgICByZXR1cm4gdGhpcy50YWcoXCJsaVwiLCBjaGlsZFRleHQsIG51bGwsIGF1eERhdGEpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgbGlzdEl0ZW1BdHRyaWJ1dGVzID0ge307XG4gICAgICB2YXIgbGlzdEl0ZW1UZXh0ID0gY2hpbGRUZXh0O1xuICAgICAgLy8gRW1iZWQgY2hlY2tib3hcbiAgICAgIGlmICgvXlxccypcXFsoWHwgfC0pXFxdKFtcXHNcXFNdKikvLmV4ZWMobGlzdEl0ZW1UZXh0KSkge1xuICAgICAgICBsaXN0SXRlbVRleHQgPSBSZWdFeHAuJDIgO1xuICAgICAgICB2YXIgY2hlY2tib3hJbmRpY2F0b3IgPSBSZWdFeHAuJDE7XG5cbiAgICAgICAgdmFyIGNoZWNrYm94QXR0cmlidXRlcyA9IHsgdHlwZTogXCJjaGVja2JveFwiIH07XG4gICAgICAgIHN3aXRjaCAoY2hlY2tib3hJbmRpY2F0b3IpIHtcbiAgICAgICAgY2FzZSBcIlhcIjpcbiAgICAgICAgICBjaGVja2JveEF0dHJpYnV0ZXNbXCJjaGVja2VkXCJdID0gXCJ0cnVlXCI7XG4gICAgICAgICAgbGlzdEl0ZW1BdHRyaWJ1dGVzW1wiZGF0YS1jaGVja2JveC1zdGF0dXNcIl0gPSBcImRvbmVcIjtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIi1cIjpcbiAgICAgICAgICBsaXN0SXRlbUF0dHJpYnV0ZXNbXCJkYXRhLWNoZWNrYm94LXN0YXR1c1wiXSA9IFwiaW50ZXJtZWRpYXRlXCI7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgbGlzdEl0ZW1BdHRyaWJ1dGVzW1wiZGF0YS1jaGVja2JveC1zdGF0dXNcIl0gPSBcInVuZG9uZVwiO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG5cbiAgICAgICAgbGlzdEl0ZW1UZXh0ID0gdGhpcy5pbmxpbmVUYWcoXCJpbnB1dFwiLCBudWxsLCBjaGVja2JveEF0dHJpYnV0ZXMpICsgbGlzdEl0ZW1UZXh0O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdGhpcy50YWcoXCJsaVwiLCBsaXN0SXRlbVRleHQsIGxpc3RJdGVtQXR0cmlidXRlcywgYXV4RGF0YSk7XG4gICAgfVxuICB9LFxuXG4gIGNvbnZlcnRQYXJhZ3JhcGg6IGZ1bmN0aW9uIChub2RlLCBjaGlsZFRleHQsIGF1eERhdGEpIHtcbiAgICByZXR1cm4gdGhpcy50YWcoXCJwXCIsIGNoaWxkVGV4dCwgbnVsbCwgYXV4RGF0YSk7XG4gIH0sXG5cbiAgY29udmVydFByZWZvcm1hdHRlZDogZnVuY3Rpb24gKG5vZGUsIGNoaWxkVGV4dCwgYXV4RGF0YSkge1xuICAgIHJldHVybiB0aGlzLnRhZyhcInByZVwiLCBjaGlsZFRleHQsIG51bGwsIGF1eERhdGEpO1xuICB9LFxuXG4gIGNvbnZlcnRUYWJsZTogZnVuY3Rpb24gKG5vZGUsIGNoaWxkVGV4dCwgYXV4RGF0YSkge1xuICAgIHJldHVybiB0aGlzLnRhZyhcInRhYmxlXCIsIHRoaXMudGFnKFwidGJvZHlcIiwgY2hpbGRUZXh0KSwgbnVsbCwgYXV4RGF0YSk7XG4gIH0sXG5cbiAgY29udmVydFRhYmxlUm93OiBmdW5jdGlvbiAobm9kZSwgY2hpbGRUZXh0LCBhdXhEYXRhKSB7XG4gICAgcmV0dXJuIHRoaXMudGFnKFwidHJcIiwgY2hpbGRUZXh0KTtcbiAgfSxcblxuICBjb252ZXJ0VGFibGVIZWFkZXI6IGZ1bmN0aW9uIChub2RlLCBjaGlsZFRleHQsIGF1eERhdGEpIHtcbiAgICByZXR1cm4gdGhpcy50YWcoXCJ0aFwiLCBjaGlsZFRleHQpO1xuICB9LFxuXG4gIGNvbnZlcnRUYWJsZUNlbGw6IGZ1bmN0aW9uIChub2RlLCBjaGlsZFRleHQsIGF1eERhdGEpIHtcbiAgICByZXR1cm4gdGhpcy50YWcoXCJ0ZFwiLCBjaGlsZFRleHQpO1xuICB9LFxuXG4gIGNvbnZlcnRIb3Jpem9udGFsUnVsZTogZnVuY3Rpb24gKG5vZGUsIGNoaWxkVGV4dCwgYXV4RGF0YSkge1xuICAgIHJldHVybiB0aGlzLnRhZyhcImhyXCIsIG51bGwsIG51bGwsIGF1eERhdGEpO1xuICB9LFxuXG4gIGNvbnZlcnRJbmxpbmVDb250YWluZXI6IGZ1bmN0aW9uIChub2RlLCBjaGlsZFRleHQsIGF1eERhdGEpIHtcbiAgICByZXR1cm4gY2hpbGRUZXh0O1xuICB9LFxuXG4gIGNvbnZlcnRCb2xkOiBmdW5jdGlvbiAobm9kZSwgY2hpbGRUZXh0LCBhdXhEYXRhKSB7XG4gICAgcmV0dXJuIHRoaXMuaW5saW5lVGFnKFwiYlwiLCBjaGlsZFRleHQpO1xuICB9LFxuXG4gIGNvbnZlcnRJdGFsaWM6IGZ1bmN0aW9uIChub2RlLCBjaGlsZFRleHQsIGF1eERhdGEpIHtcbiAgICByZXR1cm4gdGhpcy5pbmxpbmVUYWcoXCJpXCIsIGNoaWxkVGV4dCk7XG4gIH0sXG5cbiAgY29udmVydFVuZGVybGluZTogZnVuY3Rpb24gKG5vZGUsIGNoaWxkVGV4dCwgYXV4RGF0YSkge1xuICAgIHJldHVybiB0aGlzLmlubGluZVRhZyhcInNwYW5cIiwgY2hpbGRUZXh0LCB7XG4gICAgICBzdHlsZTogXCJ0ZXh0LWRlY29yYXRpb246dW5kZXJsaW5lO1wiXG4gICAgfSk7XG4gIH0sXG5cbiAgY29udmVydENvZGU6IGZ1bmN0aW9uIChub2RlLCBjaGlsZFRleHQsIGF1eERhdGEpIHtcbiAgICByZXR1cm4gdGhpcy5pbmxpbmVUYWcoXCJjb2RlXCIsIGNoaWxkVGV4dCk7XG4gIH0sXG5cbiAgY29udmVydERhc2hlZDogZnVuY3Rpb24gKG5vZGUsIGNoaWxkVGV4dCwgYXV4RGF0YSkge1xuICAgIHJldHVybiB0aGlzLmlubGluZVRhZyhcImRlbFwiLCBjaGlsZFRleHQpO1xuICB9LFxuXG4gIGNvbnZlcnRMaW5rOiBmdW5jdGlvbiAobm9kZSwgY2hpbGRUZXh0LCBhdXhEYXRhKSB7XG4gICAgdmFyIHNyY1BhcmFtZXRlclN0cmlwcGVkID0gdGhpcy5zdHJpcFBhcmFtZXRlcnNGcm9tVVJMKG5vZGUuc3JjKTtcbiAgICBpZiAodGhpcy5pbWFnZUV4dGVuc2lvblBhdHRlcm4uZXhlYyhzcmNQYXJhbWV0ZXJTdHJpcHBlZCkpIHtcbiAgICAgIHZhciBpbWdUZXh0ID0gdGhpcy5nZXROb2RlVGV4dENvbnRlbnQobm9kZSk7XG4gICAgICByZXR1cm4gdGhpcy5pbmxpbmVUYWcoXCJpbWdcIiwgbnVsbCwge1xuICAgICAgICBzcmM6IG5vZGUuc3JjLFxuICAgICAgICBhbHQ6IGltZ1RleHQsXG4gICAgICAgIHRpdGxlOiBpbWdUZXh0XG4gICAgICB9LCBhdXhEYXRhKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHRoaXMuaW5saW5lVGFnKFwiYVwiLCBjaGlsZFRleHQsIHsgaHJlZjogbm9kZS5zcmMgfSk7XG4gICAgfVxuICB9LFxuXG4gIGNvbnZlcnRRdW90ZTogZnVuY3Rpb24gKG5vZGUsIGNoaWxkVGV4dCwgYXV4RGF0YSkge1xuICAgIHJldHVybiB0aGlzLnRhZyhcImJsb2NrcXVvdGVcIiwgY2hpbGRUZXh0LCBudWxsLCBhdXhEYXRhKTtcbiAgfSxcblxuICBjb252ZXJ0RXhhbXBsZTogZnVuY3Rpb24gKG5vZGUsIGNoaWxkVGV4dCwgYXV4RGF0YSkge1xuICAgIHJldHVybiB0aGlzLnRhZyhcInByZVwiLCBjaGlsZFRleHQsIG51bGwsIGF1eERhdGEpO1xuICB9LFxuXG4gIGNvbnZlcnRTcmM6IGZ1bmN0aW9uIChub2RlLCBjaGlsZFRleHQsIGF1eERhdGEpIHtcbiAgICB2YXIgY29kZUxhbmd1YWdlID0gbm9kZS5kaXJlY3RpdmVBcmd1bWVudHMubGVuZ3RoXG4gICAgICAgICAgPyBub2RlLmRpcmVjdGl2ZUFyZ3VtZW50c1swXVxuICAgICAgICAgIDogXCJ1bmtub3duXCI7XG4gICAgY2hpbGRUZXh0ID0gdGhpcy50YWcoXCJjb2RlXCIsIGNoaWxkVGV4dCwge1xuICAgICAgXCJjbGFzc1wiOiBcImxhbmd1YWdlLVwiICsgY29kZUxhbmd1YWdlXG4gICAgfSwgYXV4RGF0YSk7XG4gICAgcmV0dXJuIHRoaXMudGFnKFwicHJlXCIsIGNoaWxkVGV4dCwge1xuICAgICAgXCJjbGFzc1wiOiBcInByZXR0eXByaW50XCJcbiAgICB9KTtcbiAgfSxcblxuICAvLyBAb3ZlcnJpZGVcbiAgY29udmVydEhUTUw6IGZ1bmN0aW9uIChub2RlLCBjaGlsZFRleHQsIGF1eERhdGEpIHtcbiAgICBpZiAobm9kZS5kaXJlY3RpdmVOYW1lID09PSBcImh0bWw6XCIpIHtcbiAgICAgIHJldHVybiBub2RlLmRpcmVjdGl2ZVJhd1ZhbHVlO1xuICAgIH0gZWxzZSBpZiAobm9kZS5kaXJlY3RpdmVOYW1lID09PSBcImh0bWxcIikge1xuICAgICAgcmV0dXJuIG5vZGUuY2hpbGRyZW4ubWFwKGZ1bmN0aW9uICh0ZXh0Tm9kZSkge1xuICAgICAgICByZXR1cm4gdGV4dE5vZGUudmFsdWU7XG4gICAgICB9KS5qb2luKFwiXFxuXCIpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gY2hpbGRUZXh0O1xuICAgIH1cbiAgfSxcblxuICAvLyBAaW1wbGVtZW50XG4gIGNvbnZlcnRIZWFkZXJCbG9jazogZnVuY3Rpb24gKGhlYWRlckJsb2NrLCBsZXZlbCwgaW5kZXgpIHtcbiAgICBsZXZlbCA9IGxldmVsIHx8IDA7XG4gICAgaW5kZXggPSBpbmRleCB8fCAwO1xuXG4gICAgdmFyIGNvbnRlbnRzID0gW107XG5cbiAgICB2YXIgaGVhZGVyTm9kZSA9IGhlYWRlckJsb2NrLmhlYWRlcjtcbiAgICBpZiAoaGVhZGVyTm9kZSkge1xuICAgICAgY29udGVudHMucHVzaCh0aGlzLmNvbnZlcnROb2RlKGhlYWRlck5vZGUpKTtcbiAgICB9XG5cbiAgICB2YXIgYmxvY2tDb250ZW50ID0gdGhpcy5jb252ZXJ0Tm9kZXMoaGVhZGVyQmxvY2suY2hpbGROb2Rlcyk7XG4gICAgY29udGVudHMucHVzaChibG9ja0NvbnRlbnQpO1xuXG4gICAgdmFyIGNoaWxkQmxvY2tDb250ZW50ID0gaGVhZGVyQmxvY2suY2hpbGRCbG9ja3NcbiAgICAgICAgICAubWFwKGZ1bmN0aW9uIChibG9jaywgaWR4KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jb252ZXJ0SGVhZGVyQmxvY2soYmxvY2ssIGxldmVsICsgMSwgaWR4KTtcbiAgICAgICAgICB9LCB0aGlzKVxuICAgICAgICAgIC5qb2luKFwiXFxuXCIpO1xuICAgIGNvbnRlbnRzLnB1c2goY2hpbGRCbG9ja0NvbnRlbnQpO1xuXG4gICAgdmFyIGNvbnRlbnRzVGV4dCA9IGNvbnRlbnRzLmpvaW4oXCJcXG5cIik7XG5cbiAgICBpZiAoaGVhZGVyTm9kZSkge1xuICAgICAgcmV0dXJuIHRoaXMudGFnKFwic2VjdGlvblwiLCBcIlxcblwiICsgY29udGVudHMuam9pbihcIlxcblwiKSwge1xuICAgICAgICBcImNsYXNzXCI6IFwiYmxvY2sgYmxvY2stbGV2ZWwtXCIgKyBsZXZlbFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBjb250ZW50c1RleHQ7XG4gICAgfVxuICB9LFxuXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gU3VwcGxlbWVudGFsIG1ldGhvZHNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIHJlcGxhY2VNYXA6IHtcbiAgICAvLyBbcmVwbGFjaW5nIHBhdHRlcm4sIHByZWRpY2F0ZV1cbiAgICBcIiZcIjogW1wiJiMzODtcIiwgbnVsbF0sXG4gICAgXCI8XCI6IFtcIiYjNjA7XCIsIG51bGxdLFxuICAgIFwiPlwiOiBbXCImIzYyO1wiLCBudWxsXSxcbiAgICAnXCInOiBbXCImIzM0O1wiLCBudWxsXSxcbiAgICBcIidcIjogW1wiJiMzOTtcIiwgbnVsbF0sXG4gICAgXCItPlwiOiBbXCImIzEwMTMyO1wiLCBmdW5jdGlvbiAodGV4dCwgaW5zaWRlQ29kZUVsZW1lbnQpIHtcbiAgICAgIHJldHVybiB0aGlzLmV4cG9ydE9wdGlvbnMudHJhbnNsYXRlU3ltYm9sQXJyb3cgJiYgIWluc2lkZUNvZGVFbGVtZW50O1xuICAgIH1dXG4gIH0sXG5cbiAgcmVwbGFjZVJlZ2V4cDogbnVsbCxcblxuICAvLyBAaW1wbGVtZW50IEBvdmVycmlkZVxuICBlc2NhcGVTcGVjaWFsQ2hhcnM6IGZ1bmN0aW9uICh0ZXh0LCBpbnNpZGVDb2RlRWxlbWVudCkge1xuICAgIGlmICghdGhpcy5yZXBsYWNlUmVnZXhwKSB7XG4gICAgICB0aGlzLnJlcGxhY2VSZWdleHAgPSBuZXcgUmVnRXhwKE9iamVjdC5rZXlzKHRoaXMucmVwbGFjZU1hcCkuam9pbihcInxcIiksIFwiZ1wiKTtcbiAgICB9XG5cbiAgICB2YXIgcmVwbGFjZU1hcCA9IHRoaXMucmVwbGFjZU1hcDtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIHRleHQucmVwbGFjZSh0aGlzLnJlcGxhY2VSZWdleHAsIGZ1bmN0aW9uIChtYXRjaGVkKSB7XG4gICAgICBpZiAoIXJlcGxhY2VNYXBbbWF0Y2hlZF0pIHtcbiAgICAgICAgdGhyb3cgRXJyb3IoXCJlc2NhcGVTcGVjaWFsQ2hhcnM6IEludmFsaWQgbWF0Y2hcIik7XG4gICAgICB9XG5cbiAgICAgIHZhciBwcmVkaWNhdGUgPSByZXBsYWNlTWFwW21hdGNoZWRdWzFdO1xuICAgICAgaWYgKHR5cGVvZiBwcmVkaWNhdGUgPT09IFwiZnVuY3Rpb25cIiAmJlxuICAgICAgICAgICFwcmVkaWNhdGUuY2FsbChzZWxmLCB0ZXh0LCBpbnNpZGVDb2RlRWxlbWVudCkpIHtcbiAgICAgICAgLy8gTm90IGZ1bGxmaWxsIHRoZSBwcmVkaWNhdGVcbiAgICAgICAgcmV0dXJuIG1hdGNoZWQ7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXBsYWNlTWFwW21hdGNoZWRdWzBdO1xuICAgIH0pO1xuICB9LFxuXG4gIC8vIEBpbXBsZW1lbnRcbiAgcG9zdFByb2Nlc3M6IGZ1bmN0aW9uIChub2RlLCBjdXJyZW50VGV4dCwgaW5zaWRlQ29kZUVsZW1lbnQpIHtcbiAgICBpZiAodGhpcy5leHBvcnRPcHRpb25zLmV4cG9ydEZyb21MaW5lTnVtYmVyICYmXG4gICAgICAgIHR5cGVvZiBub2RlLmZyb21MaW5lTnVtYmVyID09PSBcIm51bWJlclwiKSB7XG4gICAgICAvLyBXcmFwIHdpdGggbGluZSBudW1iZXIgaW5mb3JtYXRpb25cbiAgICAgIGN1cnJlbnRUZXh0ID0gdGhpcy5pbmxpbmVUYWcoXCJkaXZcIiwgY3VycmVudFRleHQsIHtcbiAgICAgICAgXCJkYXRhLWxpbmUtbnVtYmVyXCI6IG5vZGUuZnJvbUxpbmVOdW1iZXJcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gY3VycmVudFRleHQ7XG4gIH0sXG5cbiAgLy8gQGltcGxlbWVudFxuICBtYWtlTGluazogZnVuY3Rpb24gKHVybCkge1xuICAgIHJldHVybiBcIjxhIGhyZWY9XFxcIlwiICsgdXJsICsgXCJcXFwiPlwiICsgZGVjb2RlVVJJQ29tcG9uZW50KHVybCkgKyBcIjwvYT5cIjtcbiAgfSxcblxuICAvLyBAaW1wbGVtZW50XG4gIG1ha2VTdWJzY3JpcHQ6IGZ1bmN0aW9uIChtYXRjaCwgYm9keSwgc3Vic2NyaXB0KSB7XG4gICAgcmV0dXJuIFwiPHNwYW4gY2xhc3M9XFxcIm9yZy1zdWJzY3JpcHQtcGFyZW50XFxcIj5cIiArXG4gICAgICBib2R5ICtcbiAgICAgIFwiPC9zcGFuPjxzcGFuIGNsYXNzPVxcXCJvcmctc3Vic2NyaXB0LWNoaWxkXFxcIj5cIiArXG4gICAgICBzdWJzY3JpcHQgK1xuICAgICAgXCI8L3NwYW4+XCI7XG4gIH0sXG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBTcGVjaWZpYyBtZXRob2RzXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICBhdHRyaWJ1dGVzT2JqZWN0VG9TdHJpbmc6IGZ1bmN0aW9uIChhdHRyaWJ1dGVzT2JqZWN0KSB7XG4gICAgdmFyIGF0dHJpYnV0ZXNTdHJpbmcgPSBcIlwiO1xuICAgIGZvciAodmFyIGF0dHJpYnV0ZU5hbWUgaW4gYXR0cmlidXRlc09iamVjdCkge1xuICAgICAgaWYgKGF0dHJpYnV0ZXNPYmplY3QuaGFzT3duUHJvcGVydHkoYXR0cmlidXRlTmFtZSkpIHtcbiAgICAgICAgdmFyIGF0dHJpYnV0ZVZhbHVlID0gYXR0cmlidXRlc09iamVjdFthdHRyaWJ1dGVOYW1lXTtcbiAgICAgICAgLy8gVG8gYXZvaWQgaWQvY2xhc3MgbmFtZSBjb25mbGljdHMgd2l0aCBvdGhlciBmcmFtZXdvcmtzLFxuICAgICAgICAvLyB1c2VycyBjYW4gYWRkIGFyYml0cmFyeSBwcmVmaXggdG8gb3JnLWpzIGdlbmVyYXRlZFxuICAgICAgICAvLyBpZHMvY2xhc3NlcyB2aWEgZXhwb3J0T3B0aW9ucy5cbiAgICAgICAgaWYgKGF0dHJpYnV0ZU5hbWUgPT09IFwiY2xhc3NcIikge1xuICAgICAgICAgIGF0dHJpYnV0ZVZhbHVlID0gdGhpcy5vcmdDbGFzc05hbWUoYXR0cmlidXRlVmFsdWUpO1xuICAgICAgICB9IGVsc2UgaWYgKGF0dHJpYnV0ZU5hbWUgPT09IFwiaWRcIikge1xuICAgICAgICAgIGF0dHJpYnV0ZVZhbHVlID0gdGhpcy5vcmdJZChhdHRyaWJ1dGVWYWx1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgYXR0cmlidXRlc1N0cmluZyArPSBcIiBcIiArIGF0dHJpYnV0ZU5hbWUgKyBcIj1cXFwiXCIgKyBhdHRyaWJ1dGVWYWx1ZSArIFwiXFxcIlwiO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYXR0cmlidXRlc1N0cmluZztcbiAgfSxcblxuICBpbmxpbmVUYWc6IGZ1bmN0aW9uIChuYW1lLCBpbm5lclRleHQsIGF0dHJpYnV0ZXNPYmplY3QsIGF1eEF0dHJpYnV0ZXNUZXh0KSB7XG4gICAgYXR0cmlidXRlc09iamVjdCA9IGF0dHJpYnV0ZXNPYmplY3QgfHwge307XG5cbiAgICB2YXIgaHRtbFN0cmluZyA9IFwiPFwiICsgbmFtZTtcbiAgICAvLyBUT0RPOiBjaGVjayBkdXBsaWNhdGVkIGF0dHJpYnV0ZXNcbiAgICBpZiAoYXV4QXR0cmlidXRlc1RleHQpXG4gICAgICBodG1sU3RyaW5nICs9IFwiIFwiICsgYXV4QXR0cmlidXRlc1RleHQ7XG4gICAgaHRtbFN0cmluZyArPSB0aGlzLmF0dHJpYnV0ZXNPYmplY3RUb1N0cmluZyhhdHRyaWJ1dGVzT2JqZWN0KTtcblxuICAgIGlmIChpbm5lclRleHQgPT09IG51bGwpXG4gICAgICByZXR1cm4gaHRtbFN0cmluZyArIFwiLz5cIjtcblxuICAgIGh0bWxTdHJpbmcgKz0gXCI+XCIgKyBpbm5lclRleHQgKyBcIjwvXCIgKyBuYW1lICsgXCI+XCI7XG5cbiAgICByZXR1cm4gaHRtbFN0cmluZztcbiAgfSxcblxuICB0YWc6IGZ1bmN0aW9uIChuYW1lLCBpbm5lclRleHQsIGF0dHJpYnV0ZXNPYmplY3QsIGF1eEF0dHJpYnV0ZXNUZXh0KSB7XG4gICAgcmV0dXJuIHRoaXMuaW5saW5lVGFnKG5hbWUsIGlubmVyVGV4dCwgYXR0cmlidXRlc09iamVjdCwgYXV4QXR0cmlidXRlc1RleHQpICsgXCJcXG5cIjtcbiAgfVxufTtcblxuaWYgKHR5cGVvZiBleHBvcnRzICE9PSBcInVuZGVmaW5lZFwiKVxuICBleHBvcnRzLkNvbnZlcnRlckhUTUwgPSBDb252ZXJ0ZXJIVE1MO1xuIiwiLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBTeW50YXhcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG52YXIgU3ludGF4ID0ge1xuICBydWxlczoge30sXG5cbiAgZGVmaW5lOiBmdW5jdGlvbiAobmFtZSwgc3ludGF4KSB7XG4gICAgdGhpcy5ydWxlc1tuYW1lXSA9IHN5bnRheDtcbiAgICB2YXIgbWV0aG9kTmFtZSA9IFwiaXNcIiArIG5hbWUuc3Vic3RyaW5nKDAsIDEpLnRvVXBwZXJDYXNlKCkgKyBuYW1lLnN1YnN0cmluZygxKTtcbiAgICB0aGlzW21ldGhvZE5hbWVdID0gZnVuY3Rpb24gKGxpbmUpIHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bGVzW25hbWVdLmV4ZWMobGluZSk7XG4gICAgfTtcbiAgfVxufTtcblxuU3ludGF4LmRlZmluZShcImhlYWRlclwiLCAvXihcXCorKVxccysoLiopJC8pOyAvLyBtWzFdID0+IGxldmVsLCBtWzJdID0+IGNvbnRlbnRcblN5bnRheC5kZWZpbmUoXCJwcmVmb3JtYXR0ZWRcIiwgL14oXFxzKik6KD86ICguKikkfCQpLyk7IC8vIG1bMV0gPT4gaW5kZW50YXRpb24sIG1bMl0gPT4gY29udGVudFxuU3ludGF4LmRlZmluZShcInVub3JkZXJlZExpc3RFbGVtZW50XCIsIC9eKFxccyopKD86LXxcXCt8XFxzK1xcKilcXHMrKC4qKSQvKTsgLy8gbVsxXSA9PiBpbmRlbnRhdGlvbiwgbVsyXSA9PiBjb250ZW50XG5TeW50YXguZGVmaW5lKFwib3JkZXJlZExpc3RFbGVtZW50XCIsIC9eKFxccyopKFxcZCspKD86XFwufFxcKSlcXHMrKC4qKSQvKTsgLy8gbVsxXSA9PiBpbmRlbnRhdGlvbiwgbVsyXSA9PiBudW1iZXIsIG1bM10gPT4gY29udGVudFxuU3ludGF4LmRlZmluZShcInRhYmxlU2VwYXJhdG9yXCIsIC9eKFxccyopXFx8KCg/OlxcK3wtKSo/KVxcfD8kLyk7IC8vIG1bMV0gPT4gaW5kZW50YXRpb24sIG1bMl0gPT4gY29udGVudFxuU3ludGF4LmRlZmluZShcInRhYmxlUm93XCIsIC9eKFxccyopXFx8KC4qPylcXHw/JC8pOyAvLyBtWzFdID0+IGluZGVudGF0aW9uLCBtWzJdID0+IGNvbnRlbnRcblN5bnRheC5kZWZpbmUoXCJibGFua1wiLCAvXiQvKTtcblN5bnRheC5kZWZpbmUoXCJob3Jpem9udGFsUnVsZVwiLCAvXihcXHMqKS17NSx9JC8pOyAvL1xuU3ludGF4LmRlZmluZShcImRpcmVjdGl2ZVwiLCAvXihcXHMqKSNcXCsoPzooYmVnaW58ZW5kKV8pPyguKikkL2kpOyAvLyBtWzFdID0+IGluZGVudGF0aW9uLCBtWzJdID0+IHR5cGUsIG1bM10gPT4gY29udGVudFxuU3ludGF4LmRlZmluZShcImNvbW1lbnRcIiwgL14oXFxzKikjKC4qKSQvKTtcblN5bnRheC5kZWZpbmUoXCJsaW5lXCIsIC9eKFxccyopKC4qKSQvKTtcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBUb2tlblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIFRva2VuKCkge1xufVxuXG5Ub2tlbi5wcm90b3R5cGUgPSB7XG4gIGlzTGlzdEVsZW1lbnQ6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy50eXBlID09PSBMZXhlci50b2tlbnMub3JkZXJlZExpc3RFbGVtZW50IHx8XG4gICAgICB0aGlzLnR5cGUgPT09IExleGVyLnRva2Vucy51bm9yZGVyZWRMaXN0RWxlbWVudDtcbiAgfSxcblxuICBpc1RhYmxlRWxlbWVudDogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLnR5cGUgPT09IExleGVyLnRva2Vucy50YWJsZVNlcGFyYXRvciB8fFxuICAgICAgdGhpcy50eXBlID09PSBMZXhlci50b2tlbnMudGFibGVSb3c7XG4gIH1cbn07XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gTGV4ZXJcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBMZXhlcihzdHJlYW0pIHtcbiAgdGhpcy5zdHJlYW0gPSBzdHJlYW07XG4gIHRoaXMudG9rZW5TdGFjayA9IFtdO1xufVxuXG5MZXhlci5wcm90b3R5cGUgPSB7XG4gIHRva2VuaXplOiBmdW5jdGlvbiAobGluZSkge1xuICAgIHZhciB0b2tlbiA9IG5ldyBUb2tlbigpO1xuICAgIHRva2VuLmZyb21MaW5lTnVtYmVyID0gdGhpcy5zdHJlYW0ubGluZU51bWJlcjtcblxuICAgIGlmIChTeW50YXguaXNIZWFkZXIobGluZSkpIHtcbiAgICAgIHRva2VuLnR5cGUgICAgICAgID0gTGV4ZXIudG9rZW5zLmhlYWRlcjtcbiAgICAgIHRva2VuLmluZGVudGF0aW9uID0gMDtcbiAgICAgIHRva2VuLmNvbnRlbnQgICAgID0gUmVnRXhwLiQyO1xuICAgICAgLy8gc3BlY2lmaWNcbiAgICAgIHRva2VuLmxldmVsICAgICAgID0gUmVnRXhwLiQxLmxlbmd0aDtcbiAgICB9IGVsc2UgaWYgKFN5bnRheC5pc1ByZWZvcm1hdHRlZChsaW5lKSkge1xuICAgICAgdG9rZW4udHlwZSAgICAgICAgPSBMZXhlci50b2tlbnMucHJlZm9ybWF0dGVkO1xuICAgICAgdG9rZW4uaW5kZW50YXRpb24gPSBSZWdFeHAuJDEubGVuZ3RoO1xuICAgICAgdG9rZW4uY29udGVudCAgICAgPSBSZWdFeHAuJDI7XG4gICAgfSBlbHNlIGlmIChTeW50YXguaXNVbm9yZGVyZWRMaXN0RWxlbWVudChsaW5lKSkge1xuICAgICAgdG9rZW4udHlwZSAgICAgICAgPSBMZXhlci50b2tlbnMudW5vcmRlcmVkTGlzdEVsZW1lbnQ7XG4gICAgICB0b2tlbi5pbmRlbnRhdGlvbiA9IFJlZ0V4cC4kMS5sZW5ndGg7XG4gICAgICB0b2tlbi5jb250ZW50ICAgICA9IFJlZ0V4cC4kMjtcbiAgICB9IGVsc2UgaWYgKFN5bnRheC5pc09yZGVyZWRMaXN0RWxlbWVudChsaW5lKSkge1xuICAgICAgdG9rZW4udHlwZSAgICAgICAgPSBMZXhlci50b2tlbnMub3JkZXJlZExpc3RFbGVtZW50O1xuICAgICAgdG9rZW4uaW5kZW50YXRpb24gPSBSZWdFeHAuJDEubGVuZ3RoO1xuICAgICAgdG9rZW4uY29udGVudCAgICAgPSBSZWdFeHAuJDM7XG4gICAgICAvLyBzcGVjaWZpY1xuICAgICAgdG9rZW4ubnVtYmVyICAgICAgPSBSZWdFeHAuJDI7XG4gICAgfSBlbHNlIGlmIChTeW50YXguaXNUYWJsZVNlcGFyYXRvcihsaW5lKSkge1xuICAgICAgdG9rZW4udHlwZSAgICAgICAgPSBMZXhlci50b2tlbnMudGFibGVTZXBhcmF0b3I7XG4gICAgICB0b2tlbi5pbmRlbnRhdGlvbiA9IFJlZ0V4cC4kMS5sZW5ndGg7XG4gICAgICB0b2tlbi5jb250ZW50ICAgICA9IFJlZ0V4cC4kMjtcbiAgICB9IGVsc2UgaWYgKFN5bnRheC5pc1RhYmxlUm93KGxpbmUpKSB7XG4gICAgICB0b2tlbi50eXBlICAgICAgICA9IExleGVyLnRva2Vucy50YWJsZVJvdztcbiAgICAgIHRva2VuLmluZGVudGF0aW9uID0gUmVnRXhwLiQxLmxlbmd0aDtcbiAgICAgIHRva2VuLmNvbnRlbnQgICAgID0gUmVnRXhwLiQyO1xuICAgIH0gZWxzZSBpZiAoU3ludGF4LmlzQmxhbmsobGluZSkpIHtcbiAgICAgIHRva2VuLnR5cGUgICAgICAgID0gTGV4ZXIudG9rZW5zLmJsYW5rO1xuICAgICAgdG9rZW4uaW5kZW50YXRpb24gPSAwO1xuICAgICAgdG9rZW4uY29udGVudCAgICAgPSBudWxsO1xuICAgIH0gZWxzZSBpZiAoU3ludGF4LmlzSG9yaXpvbnRhbFJ1bGUobGluZSkpIHtcbiAgICAgIHRva2VuLnR5cGUgICAgICAgID0gTGV4ZXIudG9rZW5zLmhvcml6b250YWxSdWxlO1xuICAgICAgdG9rZW4uaW5kZW50YXRpb24gPSBSZWdFeHAuJDEubGVuZ3RoO1xuICAgICAgdG9rZW4uY29udGVudCAgICAgPSBudWxsO1xuICAgIH0gZWxzZSBpZiAoU3ludGF4LmlzRGlyZWN0aXZlKGxpbmUpKSB7XG4gICAgICB0b2tlbi50eXBlICAgICAgICA9IExleGVyLnRva2Vucy5kaXJlY3RpdmU7XG4gICAgICB0b2tlbi5pbmRlbnRhdGlvbiA9IFJlZ0V4cC4kMS5sZW5ndGg7XG4gICAgICB0b2tlbi5jb250ZW50ICAgICA9IFJlZ0V4cC4kMztcbiAgICAgIC8vIGRlY2lkZSBkaXJlY3RpdmUgdHlwZSAoYmVnaW4sIGVuZCBvciBvbmVzaG90KVxuICAgICAgdmFyIGRpcmVjdGl2ZVR5cGVTdHJpbmcgPSBSZWdFeHAuJDI7XG4gICAgICBpZiAoL15iZWdpbi9pLnRlc3QoZGlyZWN0aXZlVHlwZVN0cmluZykpXG4gICAgICAgIHRva2VuLmJlZ2luRGlyZWN0aXZlID0gdHJ1ZTtcbiAgICAgIGVsc2UgaWYgKC9eZW5kL2kudGVzdChkaXJlY3RpdmVUeXBlU3RyaW5nKSlcbiAgICAgICAgdG9rZW4uZW5kRGlyZWN0aXZlID0gdHJ1ZTtcbiAgICAgIGVsc2VcbiAgICAgICAgdG9rZW4ub25lc2hvdERpcmVjdGl2ZSA9IHRydWU7XG4gICAgfSBlbHNlIGlmIChTeW50YXguaXNDb21tZW50KGxpbmUpKSB7XG4gICAgICB0b2tlbi50eXBlICAgICAgICA9IExleGVyLnRva2Vucy5jb21tZW50O1xuICAgICAgdG9rZW4uaW5kZW50YXRpb24gPSBSZWdFeHAuJDEubGVuZ3RoO1xuICAgICAgdG9rZW4uY29udGVudCAgICAgPSBSZWdFeHAuJDI7XG4gICAgfSBlbHNlIGlmIChTeW50YXguaXNMaW5lKGxpbmUpKSB7XG4gICAgICB0b2tlbi50eXBlICAgICAgICA9IExleGVyLnRva2Vucy5saW5lO1xuICAgICAgdG9rZW4uaW5kZW50YXRpb24gPSBSZWdFeHAuJDEubGVuZ3RoO1xuICAgICAgdG9rZW4uY29udGVudCAgICAgPSBSZWdFeHAuJDI7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlN5bnRheEVycm9yOiBVbmtub3duIGxpbmU6IFwiICsgbGluZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRva2VuO1xuICB9LFxuXG4gIHB1c2hUb2tlbjogZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgdGhpcy50b2tlblN0YWNrLnB1c2godG9rZW4pO1xuICB9LFxuXG4gIHB1c2hEdW1teVRva2VuQnlUeXBlOiBmdW5jdGlvbiAodHlwZSkge1xuICAgIHZhciB0b2tlbiA9IG5ldyBUb2tlbigpO1xuICAgIHRva2VuLnR5cGUgPSB0eXBlO1xuICAgIHRoaXMudG9rZW5TdGFjay5wdXNoKHRva2VuKTtcbiAgfSxcblxuICBwZWVrU3RhY2tlZFRva2VuOiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMudG9rZW5TdGFjay5sZW5ndGggPiAwID9cbiAgICAgIHRoaXMudG9rZW5TdGFja1t0aGlzLnRva2VuU3RhY2subGVuZ3RoIC0gMV0gOiBudWxsO1xuICB9LFxuXG4gIGdldFN0YWNrZWRUb2tlbjogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLnRva2VuU3RhY2subGVuZ3RoID4gMCA/XG4gICAgICB0aGlzLnRva2VuU3RhY2sucG9wKCkgOiBudWxsO1xuICB9LFxuXG4gIHBlZWtOZXh0VG9rZW46IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5wZWVrU3RhY2tlZFRva2VuKCkgfHxcbiAgICAgIHRoaXMudG9rZW5pemUodGhpcy5zdHJlYW0ucGVla05leHRMaW5lKCkpO1xuICB9LFxuXG4gIGdldE5leHRUb2tlbjogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLmdldFN0YWNrZWRUb2tlbigpIHx8XG4gICAgICB0aGlzLnRva2VuaXplKHRoaXMuc3RyZWFtLmdldE5leHRMaW5lKCkpO1xuICB9LFxuXG4gIGhhc05leHQ6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5zdHJlYW0uaGFzTmV4dCgpO1xuICB9LFxuXG4gIGdldExpbmVOdW1iZXI6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5zdHJlYW0ubGluZU51bWJlcjtcbiAgfVxufTtcblxuTGV4ZXIudG9rZW5zID0ge307XG5bXG4gIFwiaGVhZGVyXCIsXG4gIFwib3JkZXJlZExpc3RFbGVtZW50XCIsXG4gIFwidW5vcmRlcmVkTGlzdEVsZW1lbnRcIixcbiAgXCJ0YWJsZVJvd1wiLFxuICBcInRhYmxlU2VwYXJhdG9yXCIsXG4gIFwicHJlZm9ybWF0dGVkXCIsXG4gIFwibGluZVwiLFxuICBcImhvcml6b250YWxSdWxlXCIsXG4gIFwiYmxhbmtcIixcbiAgXCJkaXJlY3RpdmVcIixcbiAgXCJjb21tZW50XCJcbl0uZm9yRWFjaChmdW5jdGlvbiAodG9rZW5OYW1lLCBpKSB7XG4gIExleGVyLnRva2Vuc1t0b2tlbk5hbWVdID0gaTtcbn0pO1xuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEV4cG9ydHNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5pZiAodHlwZW9mIGV4cG9ydHMgIT09IFwidW5kZWZpbmVkXCIpXG4gIGV4cG9ydHMuTGV4ZXIgPSBMZXhlcjtcbiIsImZ1bmN0aW9uIFByb3RvdHlwZU5vZGUodHlwZSwgY2hpbGRyZW4pIHtcbiAgdGhpcy50eXBlID0gdHlwZTtcbiAgdGhpcy5jaGlsZHJlbiA9IFtdO1xuXG4gIGlmIChjaGlsZHJlbikge1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBjaGlsZHJlbi5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuICAgICAgdGhpcy5hcHBlbmRDaGlsZChjaGlsZHJlbltpXSk7XG4gICAgfVxuICB9XG59XG5Qcm90b3R5cGVOb2RlLnByb3RvdHlwZSA9IHtcbiAgcHJldmlvdXNTaWJsaW5nOiBudWxsLFxuICBwYXJlbnQ6IG51bGwsXG4gIGdldCBmaXJzdENoaWxkKCkge1xuICAgIHJldHVybiB0aGlzLmNoaWxkcmVuLmxlbmd0aCA8IDEgP1xuICAgICAgbnVsbCA6IHRoaXMuY2hpbGRyZW5bMF07XG4gIH0sXG4gIGdldCBsYXN0Q2hpbGQoKSB7XG4gICAgcmV0dXJuIHRoaXMuY2hpbGRyZW4ubGVuZ3RoIDwgMSA/XG4gICAgICBudWxsIDogdGhpcy5jaGlsZHJlblt0aGlzLmNoaWxkcmVuLmxlbmd0aCAtIDFdO1xuICB9LFxuICBhcHBlbmRDaGlsZDogZnVuY3Rpb24gKG5ld0NoaWxkKSB7XG4gICAgdmFyIHByZXZpb3VzU2libGluZyA9IHRoaXMuY2hpbGRyZW4ubGVuZ3RoIDwgMSA/XG4gICAgICAgICAgbnVsbCA6IHRoaXMubGFzdENoaWxkO1xuICAgIHRoaXMuY2hpbGRyZW4ucHVzaChuZXdDaGlsZCk7XG4gICAgbmV3Q2hpbGQucHJldmlvdXNTaWJsaW5nID0gcHJldmlvdXNTaWJsaW5nO1xuICAgIG5ld0NoaWxkLnBhcmVudCA9IHRoaXM7XG4gIH0sXG4gIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHN0cmluZyA9IFwiPFwiICsgdGhpcy50eXBlICsgXCI+XCI7XG5cbiAgICBpZiAodHlwZW9mIHRoaXMudmFsdWUgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIHN0cmluZyArPSBcIiBcIiArIHRoaXMudmFsdWU7XG4gICAgfSBlbHNlIGlmICh0aGlzLmNoaWxkcmVuKSB7XG4gICAgICBzdHJpbmcgKz0gXCJcXG5cIiArIHRoaXMuY2hpbGRyZW4ubWFwKGZ1bmN0aW9uIChjaGlsZCwgaWR4KSB7XG4gICAgICAgIHJldHVybiBcIiNcIiArIGlkeCArIFwiIFwiICsgY2hpbGQudG9TdHJpbmcoKTtcbiAgICAgIH0pLmpvaW4oXCJcXG5cIikuc3BsaXQoXCJcXG5cIikubWFwKGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICAgIHJldHVybiBcIiAgXCIgKyBsaW5lO1xuICAgICAgfSkuam9pbihcIlxcblwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4gc3RyaW5nO1xuICB9XG59O1xuXG52YXIgTm9kZSA9IHtcbiAgdHlwZXM6IHt9LFxuXG4gIGRlZmluZTogZnVuY3Rpb24gKG5hbWUsIHBvc3RQcm9jZXNzKSB7XG4gICAgdGhpcy50eXBlc1tuYW1lXSA9IG5hbWU7XG5cbiAgICB2YXIgbWV0aG9kTmFtZSA9IFwiY3JlYXRlXCIgKyBuYW1lLnN1YnN0cmluZygwLCAxKS50b1VwcGVyQ2FzZSgpICsgbmFtZS5zdWJzdHJpbmcoMSk7XG4gICAgdmFyIHBvc3RQcm9jZXNzR2l2ZW4gPSB0eXBlb2YgcG9zdFByb2Nlc3MgPT09IFwiZnVuY3Rpb25cIjtcblxuICAgIHRoaXNbbWV0aG9kTmFtZV0gPSBmdW5jdGlvbiAoY2hpbGRyZW4sIG9wdGlvbnMpIHtcbiAgICAgIHZhciBub2RlID0gbmV3IFByb3RvdHlwZU5vZGUobmFtZSwgY2hpbGRyZW4pO1xuXG4gICAgICBpZiAocG9zdFByb2Nlc3NHaXZlbilcbiAgICAgICAgcG9zdFByb2Nlc3Mobm9kZSwgb3B0aW9ucyB8fCB7fSk7XG5cbiAgICAgIHJldHVybiBub2RlO1xuICAgIH07XG4gIH1cbn07XG5cbk5vZGUuZGVmaW5lKFwidGV4dFwiLCBmdW5jdGlvbiAobm9kZSwgb3B0aW9ucykge1xuICBub2RlLnZhbHVlID0gb3B0aW9ucy52YWx1ZTtcbn0pO1xuTm9kZS5kZWZpbmUoXCJoZWFkZXJcIiwgZnVuY3Rpb24gKG5vZGUsIG9wdGlvbnMpIHtcbiAgbm9kZS5sZXZlbCA9IG9wdGlvbnMubGV2ZWw7XG59KTtcbk5vZGUuZGVmaW5lKFwib3JkZXJlZExpc3RcIik7XG5Ob2RlLmRlZmluZShcInVub3JkZXJlZExpc3RcIik7XG5Ob2RlLmRlZmluZShcImRlZmluaXRpb25MaXN0XCIpO1xuTm9kZS5kZWZpbmUoXCJsaXN0RWxlbWVudFwiKTtcbk5vZGUuZGVmaW5lKFwicGFyYWdyYXBoXCIpO1xuTm9kZS5kZWZpbmUoXCJwcmVmb3JtYXR0ZWRcIik7XG5Ob2RlLmRlZmluZShcInRhYmxlXCIpO1xuTm9kZS5kZWZpbmUoXCJ0YWJsZVJvd1wiKTtcbk5vZGUuZGVmaW5lKFwidGFibGVDZWxsXCIpO1xuTm9kZS5kZWZpbmUoXCJob3Jpem9udGFsUnVsZVwiKTtcbk5vZGUuZGVmaW5lKFwiZGlyZWN0aXZlXCIpO1xuXG4vLyBJbmxpbmVcbk5vZGUuZGVmaW5lKFwiaW5saW5lQ29udGFpbmVyXCIpO1xuXG5Ob2RlLmRlZmluZShcImJvbGRcIik7XG5Ob2RlLmRlZmluZShcIml0YWxpY1wiKTtcbk5vZGUuZGVmaW5lKFwidW5kZXJsaW5lXCIpO1xuTm9kZS5kZWZpbmUoXCJjb2RlXCIpO1xuTm9kZS5kZWZpbmUoXCJ2ZXJiYXRpbVwiKTtcbk5vZGUuZGVmaW5lKFwiZGFzaGVkXCIpO1xuTm9kZS5kZWZpbmUoXCJsaW5rXCIsIGZ1bmN0aW9uIChub2RlLCBvcHRpb25zKSB7XG4gIG5vZGUuc3JjID0gb3B0aW9ucy5zcmM7XG59KTtcblxuaWYgKHR5cGVvZiBleHBvcnRzICE9PSBcInVuZGVmaW5lZFwiKVxuICBleHBvcnRzLk5vZGUgPSBOb2RlO1xuIiwidmFyIFN0cmVhbSA9IHJlcXVpcmUoXCIuL3N0cmVhbS5qc1wiKS5TdHJlYW07XG52YXIgTGV4ZXIgID0gcmVxdWlyZShcIi4vbGV4ZXIuanNcIikuTGV4ZXI7XG52YXIgTm9kZSAgID0gcmVxdWlyZShcIi4vbm9kZS5qc1wiKS5Ob2RlO1xuXG5mdW5jdGlvbiBQYXJzZXIoKSB7XG4gIHRoaXMuaW5saW5lUGFyc2VyID0gbmV3IElubGluZVBhcnNlcigpO1xufVxuXG5QYXJzZXIucGFyc2VTdHJlYW0gPSBmdW5jdGlvbiAoc3RyZWFtLCBvcHRpb25zKSB7XG4gIHZhciBwYXJzZXIgPSBuZXcgUGFyc2VyKCk7XG4gIHBhcnNlci5pbml0U3RhdHVzKHN0cmVhbSwgb3B0aW9ucyk7XG4gIHBhcnNlci5wYXJzZU5vZGVzKCk7XG4gIHJldHVybiBwYXJzZXIubm9kZXM7XG59O1xuXG5QYXJzZXIucHJvdG90eXBlID0ge1xuICBpbml0U3RhdHVzOiBmdW5jdGlvbiAoc3RyZWFtLCBvcHRpb25zKSB7XG4gICAgaWYgKHR5cGVvZiBzdHJlYW0gPT09IFwic3RyaW5nXCIpXG4gICAgICBzdHJlYW0gPSBuZXcgU3RyZWFtKHN0cmVhbSk7XG4gICAgdGhpcy5sZXhlciA9IG5ldyBMZXhlcihzdHJlYW0pO1xuICAgIHRoaXMubm9kZXMgPSBbXTtcbiAgICB0aGlzLm9wdGlvbnMgPSB7XG4gICAgICB0b2M6IHRydWUsXG4gICAgICBudW06IHRydWUsXG4gICAgICBcIl5cIjogXCJ7fVwiLFxuICAgICAgbXVsdGlsaW5lQ2VsbDogZmFsc2VcbiAgICB9O1xuICAgIC8vIE92ZXJyaWRlIG9wdGlvbiB2YWx1ZXNcbiAgICBpZiAob3B0aW9ucyAmJiB0eXBlb2Ygb3B0aW9ucyA9PT0gXCJvYmplY3RcIikge1xuICAgICAgZm9yICh2YXIga2V5IGluIG9wdGlvbnMpIHtcbiAgICAgICAgdGhpcy5vcHRpb25zW2tleV0gPSBvcHRpb25zW2tleV07XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMuZG9jdW1lbnQgPSB7XG4gICAgICBvcHRpb25zOiB0aGlzLm9wdGlvbnMsXG4gICAgICBkaXJlY3RpdmVWYWx1ZXM6IHt9LFxuICAgICAgY29udmVydDogZnVuY3Rpb24gKENvbnZlcnRlckNsYXNzLCBleHBvcnRPcHRpb25zKSB7XG4gICAgICAgIHZhciBjb252ZXJ0ZXIgPSBuZXcgQ29udmVydGVyQ2xhc3ModGhpcywgZXhwb3J0T3B0aW9ucyk7XG4gICAgICAgIHJldHVybiBjb252ZXJ0ZXIucmVzdWx0O1xuICAgICAgfVxuICAgIH07XG4gIH0sXG5cbiAgcGFyc2U6IGZ1bmN0aW9uIChzdHJlYW0sIG9wdGlvbnMpIHtcbiAgICB0aGlzLmluaXRTdGF0dXMoc3RyZWFtLCBvcHRpb25zKTtcbiAgICB0aGlzLnBhcnNlRG9jdW1lbnQoKTtcbiAgICB0aGlzLmRvY3VtZW50Lm5vZGVzID0gdGhpcy5ub2RlcztcbiAgICByZXR1cm4gdGhpcy5kb2N1bWVudDtcbiAgfSxcblxuICBjcmVhdGVFcnJvclJlcG9ydDogZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgICByZXR1cm4gbmV3IEVycm9yKG1lc3NhZ2UgKyBcIiBhdCBsaW5lIFwiICsgdGhpcy5sZXhlci5nZXRMaW5lTnVtYmVyKCkpO1xuICB9LFxuXG4gIHNraXBCbGFuazogZnVuY3Rpb24gKCkge1xuICAgIHZhciBibGFua1Rva2VuID0gbnVsbDtcbiAgICB3aGlsZSAodGhpcy5sZXhlci5wZWVrTmV4dFRva2VuKCkudHlwZSA9PT0gTGV4ZXIudG9rZW5zLmJsYW5rKVxuICAgICAgYmxhbmtUb2tlbiA9IHRoaXMubGV4ZXIuZ2V0TmV4dFRva2VuKCk7XG4gICAgcmV0dXJuIGJsYW5rVG9rZW47XG4gIH0sXG5cbiAgc2V0Tm9kZU9yaWdpbkZyb21Ub2tlbjogZnVuY3Rpb24gKG5vZGUsIHRva2VuKSB7XG4gICAgbm9kZS5mcm9tTGluZU51bWJlciA9IHRva2VuLmZyb21MaW5lTnVtYmVyO1xuICAgIHJldHVybiBub2RlO1xuICB9LFxuXG4gIGFwcGVuZE5vZGU6IGZ1bmN0aW9uIChuZXdOb2RlKSB7XG4gICAgdmFyIHByZXZpb3VzU2libGluZyA9IHRoaXMubm9kZXMubGVuZ3RoID4gMCA/IHRoaXMubm9kZXNbdGhpcy5ub2Rlcy5sZW5ndGggLSAxXSA6IG51bGw7XG4gICAgdGhpcy5ub2Rlcy5wdXNoKG5ld05vZGUpO1xuICAgIG5ld05vZGUucHJldmlvdXNTaWJsaW5nID0gcHJldmlvdXNTaWJsaW5nO1xuICB9LFxuXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyA8RG9jdW1lbnQ+IDo6PSA8RWxlbWVudD4qXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIHBhcnNlRG9jdW1lbnQ6IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLnBhcnNlVGl0bGUoKTtcbiAgICB0aGlzLnBhcnNlTm9kZXMoKTtcbiAgfSxcblxuICBwYXJzZU5vZGVzOiBmdW5jdGlvbiAoKSB7XG4gICAgd2hpbGUgKHRoaXMubGV4ZXIuaGFzTmV4dCgpKSB7XG4gICAgICB2YXIgZWxlbWVudCA9IHRoaXMucGFyc2VFbGVtZW50KCk7XG4gICAgICBpZiAoZWxlbWVudCkgdGhpcy5hcHBlbmROb2RlKGVsZW1lbnQpO1xuICAgIH1cbiAgfSxcblxuICBwYXJzZVRpdGxlOiBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5za2lwQmxhbmsoKTtcblxuICAgIGlmICh0aGlzLmxleGVyLmhhc05leHQoKSAmJlxuICAgICAgICB0aGlzLmxleGVyLnBlZWtOZXh0VG9rZW4oKS50eXBlID09PSBMZXhlci50b2tlbnMubGluZSlcbiAgICAgIHRoaXMuZG9jdW1lbnQudGl0bGUgPSB0aGlzLmNyZWF0ZVRleHROb2RlKHRoaXMubGV4ZXIuZ2V0TmV4dFRva2VuKCkuY29udGVudCk7XG4gICAgZWxzZVxuICAgICAgdGhpcy5kb2N1bWVudC50aXRsZSA9IG51bGw7XG5cbiAgICB0aGlzLmxleGVyLnB1c2hEdW1teVRva2VuQnlUeXBlKExleGVyLnRva2Vucy5ibGFuayk7XG4gIH0sXG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIDxFbGVtZW50PiA6Oj0gKDxIZWFkZXI+IHwgPExpc3Q+XG4gIC8vICAgICAgICAgICAgICB8IDxQcmVmb3JtYXR0ZWQ+IHwgPFBhcmFncmFwaD5cbiAgLy8gICAgICAgICAgICAgIHwgPFRhYmxlPikqXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIHBhcnNlRWxlbWVudDogZnVuY3Rpb24gKCkge1xuICAgIHZhciBlbGVtZW50ID0gbnVsbDtcblxuICAgIHN3aXRjaCAodGhpcy5sZXhlci5wZWVrTmV4dFRva2VuKCkudHlwZSkge1xuICAgIGNhc2UgTGV4ZXIudG9rZW5zLmhlYWRlcjpcbiAgICAgIGVsZW1lbnQgPSB0aGlzLnBhcnNlSGVhZGVyKCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIExleGVyLnRva2Vucy5wcmVmb3JtYXR0ZWQ6XG4gICAgICBlbGVtZW50ID0gdGhpcy5wYXJzZVByZWZvcm1hdHRlZCgpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBMZXhlci50b2tlbnMub3JkZXJlZExpc3RFbGVtZW50OlxuICAgIGNhc2UgTGV4ZXIudG9rZW5zLnVub3JkZXJlZExpc3RFbGVtZW50OlxuICAgICAgZWxlbWVudCA9IHRoaXMucGFyc2VMaXN0KCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIExleGVyLnRva2Vucy5saW5lOlxuICAgICAgZWxlbWVudCA9IHRoaXMucGFyc2VUZXh0KCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIExleGVyLnRva2Vucy50YWJsZVJvdzpcbiAgICBjYXNlIExleGVyLnRva2Vucy50YWJsZVNlcGFyYXRvcjpcbiAgICAgIGVsZW1lbnQgPSB0aGlzLnBhcnNlVGFibGUoKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgTGV4ZXIudG9rZW5zLmJsYW5rOlxuICAgICAgdGhpcy5za2lwQmxhbmsoKTtcbiAgICAgIGlmICh0aGlzLmxleGVyLmhhc05leHQoKSkge1xuICAgICAgICBpZiAodGhpcy5sZXhlci5wZWVrTmV4dFRva2VuKCkudHlwZSA9PT0gTGV4ZXIudG9rZW5zLmxpbmUpXG4gICAgICAgICAgZWxlbWVudCA9IHRoaXMucGFyc2VQYXJhZ3JhcGgoKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgIGVsZW1lbnQgPSB0aGlzLnBhcnNlRWxlbWVudCgpO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSBMZXhlci50b2tlbnMuaG9yaXpvbnRhbFJ1bGU6XG4gICAgICB0aGlzLmxleGVyLmdldE5leHRUb2tlbigpO1xuICAgICAgZWxlbWVudCA9IE5vZGUuY3JlYXRlSG9yaXpvbnRhbFJ1bGUoKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgTGV4ZXIudG9rZW5zLmRpcmVjdGl2ZTpcbiAgICAgIGVsZW1lbnQgPSB0aGlzLnBhcnNlRGlyZWN0aXZlKCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIExleGVyLnRva2Vucy5jb21tZW50OlxuICAgICAgLy8gU2tpcFxuICAgICAgdGhpcy5sZXhlci5nZXROZXh0VG9rZW4oKTtcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyB0aGlzLmNyZWF0ZUVycm9yUmVwb3J0KFwiVW5oYW5kbGVkIHRva2VuOiBcIiArIHRoaXMubGV4ZXIucGVla05leHRUb2tlbigpLnR5cGUpO1xuICAgIH1cblxuICAgIHJldHVybiBlbGVtZW50O1xuICB9LFxuXG4gIHBhcnNlRWxlbWVudEJlc2lkZXNEaXJlY3RpdmVFbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICB0cnkge1xuICAgICAgLy8gVGVtcG9yYXJ5LCBvdmVycmlkZSB0aGUgZGVmaW5pdGlvbiBvZiBgcGFyc2VFbGVtZW50YFxuICAgICAgdGhpcy5wYXJzZUVsZW1lbnQgPSB0aGlzLnBhcnNlRWxlbWVudEJlc2lkZXNEaXJlY3RpdmVFbmRCb2R5O1xuICAgICAgcmV0dXJuIHRoaXMucGFyc2VFbGVtZW50KCk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMucGFyc2VFbGVtZW50ID0gdGhpcy5vcmlnaW5hbFBhcnNlRWxlbWVudDtcbiAgICB9XG4gIH0sXG5cbiAgcGFyc2VFbGVtZW50QmVzaWRlc0RpcmVjdGl2ZUVuZEJvZHk6IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAodGhpcy5sZXhlci5wZWVrTmV4dFRva2VuKCkudHlwZSA9PT0gTGV4ZXIudG9rZW5zLmRpcmVjdGl2ZSAmJlxuICAgICAgICB0aGlzLmxleGVyLnBlZWtOZXh0VG9rZW4oKS5lbmREaXJlY3RpdmUpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLm9yaWdpbmFsUGFyc2VFbGVtZW50KCk7XG4gIH0sXG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIDxIZWFkZXI+XG4gIC8vXG4gIC8vIDogcHJlZm9ybWF0dGVkXG4gIC8vIDogYmxvY2tcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgcGFyc2VIZWFkZXI6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgaGVhZGVyVG9rZW4gPSB0aGlzLmxleGVyLmdldE5leHRUb2tlbigpO1xuICAgIHZhciBoZWFkZXIgPSBOb2RlLmNyZWF0ZUhlYWRlcihbXG4gICAgICB0aGlzLmNyZWF0ZVRleHROb2RlKGhlYWRlclRva2VuLmNvbnRlbnQpIC8vIFRPRE86IFBhcnNlIGlubGluZSBtYXJrdXBzXG4gICAgXSwgeyBsZXZlbDogaGVhZGVyVG9rZW4ubGV2ZWwgfSk7XG4gICAgdGhpcy5zZXROb2RlT3JpZ2luRnJvbVRva2VuKGhlYWRlciwgaGVhZGVyVG9rZW4pO1xuXG4gICAgcmV0dXJuIGhlYWRlcjtcbiAgfSxcblxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gPFByZWZvcm1hdHRlZD5cbiAgLy9cbiAgLy8gOiBwcmVmb3JtYXR0ZWRcbiAgLy8gOiBibG9ja1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICBwYXJzZVByZWZvcm1hdHRlZDogZnVuY3Rpb24gKCkge1xuICAgIHZhciBwcmVmb3JtYXR0ZWRGaXJzdFRva2VuID0gdGhpcy5sZXhlci5wZWVrTmV4dFRva2VuKCk7XG4gICAgdmFyIHByZWZvcm1hdHRlZCA9IE5vZGUuY3JlYXRlUHJlZm9ybWF0dGVkKFtdKTtcbiAgICB0aGlzLnNldE5vZGVPcmlnaW5Gcm9tVG9rZW4ocHJlZm9ybWF0dGVkLCBwcmVmb3JtYXR0ZWRGaXJzdFRva2VuKTtcblxuICAgIHZhciB0ZXh0Q29udGVudHMgPSBbXTtcblxuICAgIHdoaWxlICh0aGlzLmxleGVyLmhhc05leHQoKSkge1xuICAgICAgdmFyIHRva2VuID0gdGhpcy5sZXhlci5wZWVrTmV4dFRva2VuKCk7XG4gICAgICBpZiAodG9rZW4udHlwZSAhPT0gTGV4ZXIudG9rZW5zLnByZWZvcm1hdHRlZCB8fFxuICAgICAgICAgIHRva2VuLmluZGVudGF0aW9uIDwgcHJlZm9ybWF0dGVkRmlyc3RUb2tlbi5pbmRlbnRhdGlvbilcbiAgICAgICAgYnJlYWs7XG4gICAgICB0aGlzLmxleGVyLmdldE5leHRUb2tlbigpO1xuICAgICAgdGV4dENvbnRlbnRzLnB1c2godG9rZW4uY29udGVudCk7XG4gICAgfVxuXG4gICAgcHJlZm9ybWF0dGVkLmFwcGVuZENoaWxkKHRoaXMuY3JlYXRlVGV4dE5vZGUodGV4dENvbnRlbnRzLmpvaW4oXCJcXG5cIiksIHRydWUgLyogbm8gZW1waGFzaXMgKi8pKTtcblxuICAgIHJldHVybiBwcmVmb3JtYXR0ZWQ7XG4gIH0sXG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIDxMaXN0PlxuICAvL1xuICAvLyAgLSBmb29cbiAgLy8gICAgMS4gYmFyXG4gIC8vICAgIDIuIGJhelxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBYWFg6IG5vdCBjb25zaWRlciBjb2RlcyAoZS5nLiwgPUZvbzo6QmFyPSlcbiAgZGVmaW5pdGlvblBhdHRlcm46IC9eKC4qPykgOjogKiguKikkLyxcblxuICBwYXJzZUxpc3Q6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgcm9vdFRva2VuID0gdGhpcy5sZXhlci5wZWVrTmV4dFRva2VuKCk7XG4gICAgdmFyIGxpc3Q7XG4gICAgdmFyIGlzRGVmaW5pdGlvbkxpc3QgPSBmYWxzZTtcblxuICAgIGlmICh0aGlzLmRlZmluaXRpb25QYXR0ZXJuLnRlc3Qocm9vdFRva2VuLmNvbnRlbnQpKSB7XG4gICAgICBsaXN0ID0gTm9kZS5jcmVhdGVEZWZpbml0aW9uTGlzdChbXSk7XG4gICAgICBpc0RlZmluaXRpb25MaXN0ID0gdHJ1ZTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGlzdCA9IHJvb3RUb2tlbi50eXBlID09PSBMZXhlci50b2tlbnMudW5vcmRlcmVkTGlzdEVsZW1lbnQgP1xuICAgICAgICBOb2RlLmNyZWF0ZVVub3JkZXJlZExpc3QoW10pIDogTm9kZS5jcmVhdGVPcmRlcmVkTGlzdChbXSk7XG4gICAgfVxuICAgIHRoaXMuc2V0Tm9kZU9yaWdpbkZyb21Ub2tlbihsaXN0LCByb290VG9rZW4pO1xuXG4gICAgd2hpbGUgKHRoaXMubGV4ZXIuaGFzTmV4dCgpKSB7XG4gICAgICB2YXIgbmV4dFRva2VuID0gdGhpcy5sZXhlci5wZWVrTmV4dFRva2VuKCk7XG4gICAgICBpZiAoIW5leHRUb2tlbi5pc0xpc3RFbGVtZW50KCkgfHwgbmV4dFRva2VuLmluZGVudGF0aW9uICE9PSByb290VG9rZW4uaW5kZW50YXRpb24pXG4gICAgICAgIGJyZWFrO1xuICAgICAgbGlzdC5hcHBlbmRDaGlsZCh0aGlzLnBhcnNlTGlzdEVsZW1lbnQocm9vdFRva2VuLmluZGVudGF0aW9uLCBpc0RlZmluaXRpb25MaXN0KSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGxpc3Q7XG4gIH0sXG5cbiAgdW5rbm93bkRlZmluaXRpb25UZXJtOiBcIj8/P1wiLFxuXG4gIHBhcnNlTGlzdEVsZW1lbnQ6IGZ1bmN0aW9uIChyb290SW5kZW50YXRpb24sIGlzRGVmaW5pdGlvbkxpc3QpIHtcbiAgICB2YXIgbGlzdEVsZW1lbnRUb2tlbiA9IHRoaXMubGV4ZXIuZ2V0TmV4dFRva2VuKCk7XG4gICAgdmFyIGxpc3RFbGVtZW50ID0gTm9kZS5jcmVhdGVMaXN0RWxlbWVudChbXSk7XG4gICAgdGhpcy5zZXROb2RlT3JpZ2luRnJvbVRva2VuKGxpc3RFbGVtZW50LCBsaXN0RWxlbWVudFRva2VuKTtcblxuICAgIGxpc3RFbGVtZW50LmlzRGVmaW5pdGlvbkxpc3QgPSBpc0RlZmluaXRpb25MaXN0O1xuXG4gICAgaWYgKGlzRGVmaW5pdGlvbkxpc3QpIHtcbiAgICAgIHZhciBtYXRjaCA9IHRoaXMuZGVmaW5pdGlvblBhdHRlcm4uZXhlYyhsaXN0RWxlbWVudFRva2VuLmNvbnRlbnQpO1xuICAgICAgbGlzdEVsZW1lbnQudGVybSA9IFtcbiAgICAgICAgdGhpcy5jcmVhdGVUZXh0Tm9kZShtYXRjaCAmJiBtYXRjaFsxXSA/IG1hdGNoWzFdIDogdGhpcy51bmtub3duRGVmaW5pdGlvblRlcm0pXG4gICAgICBdO1xuICAgICAgbGlzdEVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5jcmVhdGVUZXh0Tm9kZShtYXRjaCA/IG1hdGNoWzJdIDogbGlzdEVsZW1lbnRUb2tlbi5jb250ZW50KSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGxpc3RFbGVtZW50LmFwcGVuZENoaWxkKHRoaXMuY3JlYXRlVGV4dE5vZGUobGlzdEVsZW1lbnRUb2tlbi5jb250ZW50KSk7XG4gICAgfVxuXG4gICAgd2hpbGUgKHRoaXMubGV4ZXIuaGFzTmV4dCgpKSB7XG4gICAgICB2YXIgYmxhbmtUb2tlbiA9IHRoaXMuc2tpcEJsYW5rKCk7XG4gICAgICBpZiAoIXRoaXMubGV4ZXIuaGFzTmV4dCgpKVxuICAgICAgICBicmVhaztcblxuICAgICAgdmFyIG5vdEJsYW5rTmV4dFRva2VuID0gdGhpcy5sZXhlci5wZWVrTmV4dFRva2VuKCk7XG4gICAgICBpZiAoYmxhbmtUb2tlbiAmJiAhbm90QmxhbmtOZXh0VG9rZW4uaXNMaXN0RWxlbWVudCgpKVxuICAgICAgICB0aGlzLmxleGVyLnB1c2hUb2tlbihibGFua1Rva2VuKTsgLy8gUmVjb3ZlciBibGFuayB0b2tlbiBvbmx5IHdoZW4gbmV4dCBsaW5lIGlzIG5vdCBsaXN0RWxlbWVudC5cbiAgICAgIGlmIChub3RCbGFua05leHRUb2tlbi5pbmRlbnRhdGlvbiA8PSByb290SW5kZW50YXRpb24pXG4gICAgICAgIGJyZWFrOyAgICAgICAgICAgICAgICAgIC8vIGVuZCBvZiB0aGUgbGlzdFxuXG4gICAgICB2YXIgZWxlbWVudCA9IHRoaXMucGFyc2VFbGVtZW50KCk7IC8vIHJlY3Vyc2l2ZVxuICAgICAgaWYgKGVsZW1lbnQpXG4gICAgICAgIGxpc3RFbGVtZW50LmFwcGVuZENoaWxkKGVsZW1lbnQpO1xuICAgIH1cblxuICAgIHJldHVybiBsaXN0RWxlbWVudDtcbiAgfSxcblxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gPFRhYmxlPiA6Oj0gPFRhYmxlUm93PitcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgcGFyc2VUYWJsZTogZnVuY3Rpb24gKCkge1xuICAgIHZhciBuZXh0VG9rZW4gPSB0aGlzLmxleGVyLnBlZWtOZXh0VG9rZW4oKTtcbiAgICB2YXIgdGFibGUgPSBOb2RlLmNyZWF0ZVRhYmxlKFtdKTtcbiAgICB0aGlzLnNldE5vZGVPcmlnaW5Gcm9tVG9rZW4odGFibGUsIG5leHRUb2tlbik7XG4gICAgdmFyIHNhd1NlcGFyYXRvciA9IGZhbHNlO1xuXG4gICAgdmFyIGFsbG93TXVsdGlsaW5lQ2VsbCA9IG5leHRUb2tlbi50eXBlID09PSBMZXhlci50b2tlbnMudGFibGVTZXBhcmF0b3IgJiYgdGhpcy5vcHRpb25zLm11bHRpbGluZUNlbGw7XG5cbiAgICB3aGlsZSAodGhpcy5sZXhlci5oYXNOZXh0KCkgJiZcbiAgICAgICAgICAgKG5leHRUb2tlbiA9IHRoaXMubGV4ZXIucGVla05leHRUb2tlbigpKS5pc1RhYmxlRWxlbWVudCgpKSB7XG4gICAgICBpZiAobmV4dFRva2VuLnR5cGUgPT09IExleGVyLnRva2Vucy50YWJsZVJvdykge1xuICAgICAgICB2YXIgdGFibGVSb3cgPSB0aGlzLnBhcnNlVGFibGVSb3coYWxsb3dNdWx0aWxpbmVDZWxsKTtcbiAgICAgICAgdGFibGUuYXBwZW5kQ2hpbGQodGFibGVSb3cpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gTGV4ZXIudG9rZW5zLnRhYmxlU2VwYXJhdG9yXG4gICAgICAgIHNhd1NlcGFyYXRvciA9IHRydWU7XG4gICAgICAgIHRoaXMubGV4ZXIuZ2V0TmV4dFRva2VuKCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHNhd1NlcGFyYXRvciAmJiB0YWJsZS5jaGlsZHJlbi5sZW5ndGgpIHtcbiAgICAgIHRhYmxlLmNoaWxkcmVuWzBdLmNoaWxkcmVuLmZvckVhY2goZnVuY3Rpb24gKGNlbGwpIHtcbiAgICAgICAgY2VsbC5pc0hlYWRlciA9IHRydWU7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGFibGU7XG4gIH0sXG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIDxUYWJsZVJvdz4gOjo9IDxUYWJsZUNlbGw+K1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICBwYXJzZVRhYmxlUm93OiBmdW5jdGlvbiAoYWxsb3dNdWx0aWxpbmVDZWxsKSB7XG4gICAgdmFyIHRhYmxlUm93VG9rZW5zID0gW107XG5cbiAgICB3aGlsZSAodGhpcy5sZXhlci5wZWVrTmV4dFRva2VuKCkudHlwZSA9PT0gTGV4ZXIudG9rZW5zLnRhYmxlUm93KSB7XG4gICAgICB0YWJsZVJvd1Rva2Vucy5wdXNoKHRoaXMubGV4ZXIuZ2V0TmV4dFRva2VuKCkpO1xuICAgICAgaWYgKCFhbGxvd011bHRpbGluZUNlbGwpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCF0YWJsZVJvd1Rva2Vucy5sZW5ndGgpIHtcbiAgICAgIHRocm93IHRoaXMuY3JlYXRlRXJyb3JSZXBvcnQoXCJFeHBlY3RlZCB0YWJsZSByb3dcIik7XG4gICAgfVxuXG4gICAgdmFyIGZpcnN0VGFibGVSb3dUb2tlbiA9IHRhYmxlUm93VG9rZW5zLnNoaWZ0KCk7XG4gICAgdmFyIHRhYmxlQ2VsbFRleHRzID0gZmlyc3RUYWJsZVJvd1Rva2VuLmNvbnRlbnQuc3BsaXQoXCJ8XCIpO1xuXG4gICAgdGFibGVSb3dUb2tlbnMuZm9yRWFjaChmdW5jdGlvbiAocm93VG9rZW4pIHtcbiAgICAgIHJvd1Rva2VuLmNvbnRlbnQuc3BsaXQoXCJ8XCIpLmZvckVhY2goZnVuY3Rpb24gKGNlbGxUZXh0LCBjZWxsSWR4KSB7XG4gICAgICAgIHRhYmxlQ2VsbFRleHRzW2NlbGxJZHhdID0gKHRhYmxlQ2VsbFRleHRzW2NlbGxJZHhdIHx8IFwiXCIpICsgXCJcXG5cIiArIGNlbGxUZXh0O1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBUT0RPOiBQcmVwYXJlIHR3byBwYXRoZXM6ICgxKVxuICAgIHZhciB0YWJsZUNlbGxzID0gdGFibGVDZWxsVGV4dHMubWFwKFxuICAgICAgLy8gVE9ETzogY29uc2lkZXIgJ3wnIGVzY2FwZT9cbiAgICAgIGZ1bmN0aW9uICh0ZXh0KSB7XG4gICAgICAgIHJldHVybiBOb2RlLmNyZWF0ZVRhYmxlQ2VsbChQYXJzZXIucGFyc2VTdHJlYW0odGV4dCkpO1xuICAgICAgfSwgdGhpcyk7XG5cbiAgICByZXR1cm4gdGhpcy5zZXROb2RlT3JpZ2luRnJvbVRva2VuKE5vZGUuY3JlYXRlVGFibGVSb3codGFibGVDZWxscyksIGZpcnN0VGFibGVSb3dUb2tlbik7XG4gIH0sXG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIDxEaXJlY3RpdmU+IDo6PSBcIiMrLipcIlxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICBwYXJzZURpcmVjdGl2ZTogZnVuY3Rpb24gKCkge1xuICAgIHZhciBkaXJlY3RpdmVUb2tlbiA9IHRoaXMubGV4ZXIuZ2V0TmV4dFRva2VuKCk7XG4gICAgdmFyIGRpcmVjdGl2ZU5vZGUgPSB0aGlzLmNyZWF0ZURpcmVjdGl2ZU5vZGVGcm9tVG9rZW4oZGlyZWN0aXZlVG9rZW4pO1xuXG4gICAgaWYgKGRpcmVjdGl2ZVRva2VuLmVuZERpcmVjdGl2ZSlcbiAgICAgIHRocm93IHRoaXMuY3JlYXRlRXJyb3JSZXBvcnQoXCJVbm1hdGNoZWQgJ2VuZCcgZGlyZWN0aXZlIGZvciBcIiArIGRpcmVjdGl2ZU5vZGUuZGlyZWN0aXZlTmFtZSk7XG5cbiAgICBpZiAoZGlyZWN0aXZlVG9rZW4ub25lc2hvdERpcmVjdGl2ZSkge1xuICAgICAgdGhpcy5pbnRlcnByZXREaXJlY3RpdmUoZGlyZWN0aXZlTm9kZSk7XG4gICAgICByZXR1cm4gZGlyZWN0aXZlTm9kZTtcbiAgICB9XG5cbiAgICBpZiAoIWRpcmVjdGl2ZVRva2VuLmJlZ2luRGlyZWN0aXZlKVxuICAgICAgdGhyb3cgdGhpcy5jcmVhdGVFcnJvclJlcG9ydChcIkludmFsaWQgZGlyZWN0aXZlIFwiICsgZGlyZWN0aXZlTm9kZS5kaXJlY3RpdmVOYW1lKTtcblxuICAgIC8vIFBhcnNlIGJlZ2luIH4gZW5kXG4gICAgZGlyZWN0aXZlTm9kZS5jaGlsZHJlbiA9IFtdO1xuICAgIGlmICh0aGlzLmlzVmVyYmF0aW1EaXJlY3RpdmUoZGlyZWN0aXZlTm9kZSkpXG4gICAgICByZXR1cm4gdGhpcy5wYXJzZURpcmVjdGl2ZUJsb2NrVmVyYmF0aW0oZGlyZWN0aXZlTm9kZSk7XG4gICAgZWxzZVxuICAgICAgcmV0dXJuIHRoaXMucGFyc2VEaXJlY3RpdmVCbG9jayhkaXJlY3RpdmVOb2RlKTtcbiAgfSxcblxuICBjcmVhdGVEaXJlY3RpdmVOb2RlRnJvbVRva2VuOiBmdW5jdGlvbiAoZGlyZWN0aXZlVG9rZW4pIHtcbiAgICB2YXIgbWF0Y2hlZCA9IC9eWyBdKihbXiBdKilbIF0qKC4qKVsgXSokLy5leGVjKGRpcmVjdGl2ZVRva2VuLmNvbnRlbnQpO1xuXG4gICAgdmFyIGRpcmVjdGl2ZU5vZGUgPSBOb2RlLmNyZWF0ZURpcmVjdGl2ZShudWxsKTtcbiAgICB0aGlzLnNldE5vZGVPcmlnaW5Gcm9tVG9rZW4oZGlyZWN0aXZlTm9kZSwgZGlyZWN0aXZlVG9rZW4pO1xuICAgIGRpcmVjdGl2ZU5vZGUuZGlyZWN0aXZlTmFtZSA9IG1hdGNoZWRbMV0udG9Mb3dlckNhc2UoKTtcbiAgICBkaXJlY3RpdmVOb2RlLmRpcmVjdGl2ZUFyZ3VtZW50cyA9IHRoaXMucGFyc2VEaXJlY3RpdmVBcmd1bWVudHMobWF0Y2hlZFsyXSk7XG4gICAgZGlyZWN0aXZlTm9kZS5kaXJlY3RpdmVPcHRpb25zID0gdGhpcy5wYXJzZURpcmVjdGl2ZU9wdGlvbnMobWF0Y2hlZFsyXSk7XG4gICAgZGlyZWN0aXZlTm9kZS5kaXJlY3RpdmVSYXdWYWx1ZSA9IG1hdGNoZWRbMl07XG5cbiAgICByZXR1cm4gZGlyZWN0aXZlTm9kZTtcbiAgfSxcblxuICBpc1ZlcmJhdGltRGlyZWN0aXZlOiBmdW5jdGlvbiAoZGlyZWN0aXZlTm9kZSkge1xuICAgIHZhciBkaXJlY3RpdmVOYW1lID0gZGlyZWN0aXZlTm9kZS5kaXJlY3RpdmVOYW1lO1xuICAgIHJldHVybiBkaXJlY3RpdmVOYW1lID09PSBcInNyY1wiIHx8IGRpcmVjdGl2ZU5hbWUgPT09IFwiZXhhbXBsZVwiIHx8IGRpcmVjdGl2ZU5hbWUgPT09IFwiaHRtbFwiO1xuICB9LFxuXG4gIHBhcnNlRGlyZWN0aXZlQmxvY2s6IGZ1bmN0aW9uIChkaXJlY3RpdmVOb2RlLCB2ZXJiYXRpbSkge1xuICAgIHRoaXMubGV4ZXIucHVzaER1bW15VG9rZW5CeVR5cGUoTGV4ZXIudG9rZW5zLmJsYW5rKTtcblxuICAgIHdoaWxlICh0aGlzLmxleGVyLmhhc05leHQoKSkge1xuICAgICAgdmFyIG5leHRUb2tlbiA9IHRoaXMubGV4ZXIucGVla05leHRUb2tlbigpO1xuICAgICAgaWYgKG5leHRUb2tlbi50eXBlID09PSBMZXhlci50b2tlbnMuZGlyZWN0aXZlICYmXG4gICAgICAgICAgbmV4dFRva2VuLmVuZERpcmVjdGl2ZSAmJlxuICAgICAgICAgIHRoaXMuY3JlYXRlRGlyZWN0aXZlTm9kZUZyb21Ub2tlbihuZXh0VG9rZW4pLmRpcmVjdGl2ZU5hbWUgPT09IGRpcmVjdGl2ZU5vZGUuZGlyZWN0aXZlTmFtZSkge1xuICAgICAgICAvLyBDbG9zZSBkaXJlY3RpdmVcbiAgICAgICAgdGhpcy5sZXhlci5nZXROZXh0VG9rZW4oKTtcbiAgICAgICAgcmV0dXJuIGRpcmVjdGl2ZU5vZGU7XG4gICAgICB9XG4gICAgICB2YXIgZWxlbWVudCA9IHRoaXMucGFyc2VFbGVtZW50QmVzaWRlc0RpcmVjdGl2ZUVuZCgpO1xuICAgICAgaWYgKGVsZW1lbnQpXG4gICAgICAgIGRpcmVjdGl2ZU5vZGUuYXBwZW5kQ2hpbGQoZWxlbWVudCk7XG4gICAgfVxuXG4gICAgdGhyb3cgdGhpcy5jcmVhdGVFcnJvclJlcG9ydChcIlVuY2xvc2VkIGRpcmVjdGl2ZSBcIiArIGRpcmVjdGl2ZU5vZGUuZGlyZWN0aXZlTmFtZSk7XG4gIH0sXG5cbiAgcGFyc2VEaXJlY3RpdmVCbG9ja1ZlcmJhdGltOiBmdW5jdGlvbiAoZGlyZWN0aXZlTm9kZSkge1xuICAgIHZhciB0ZXh0Q29udGVudCA9IFtdO1xuXG4gICAgd2hpbGUgKHRoaXMubGV4ZXIuaGFzTmV4dCgpKSB7XG4gICAgICB2YXIgbmV4dFRva2VuID0gdGhpcy5sZXhlci5wZWVrTmV4dFRva2VuKCk7XG4gICAgICBpZiAobmV4dFRva2VuLnR5cGUgPT09IExleGVyLnRva2Vucy5kaXJlY3RpdmUgJiZcbiAgICAgICAgICBuZXh0VG9rZW4uZW5kRGlyZWN0aXZlICYmXG4gICAgICAgICAgdGhpcy5jcmVhdGVEaXJlY3RpdmVOb2RlRnJvbVRva2VuKG5leHRUb2tlbikuZGlyZWN0aXZlTmFtZSA9PT0gZGlyZWN0aXZlTm9kZS5kaXJlY3RpdmVOYW1lKSB7XG4gICAgICAgIHRoaXMubGV4ZXIuZ2V0TmV4dFRva2VuKCk7XG4gICAgICAgIGRpcmVjdGl2ZU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5jcmVhdGVUZXh0Tm9kZSh0ZXh0Q29udGVudC5qb2luKFwiXFxuXCIpLCB0cnVlKSk7XG4gICAgICAgIHJldHVybiBkaXJlY3RpdmVOb2RlO1xuICAgICAgfVxuICAgICAgdGV4dENvbnRlbnQucHVzaCh0aGlzLmxleGVyLnN0cmVhbS5nZXROZXh0TGluZSgpKTtcbiAgICB9XG5cbiAgICB0aHJvdyB0aGlzLmNyZWF0ZUVycm9yUmVwb3J0KFwiVW5jbG9zZWQgZGlyZWN0aXZlIFwiICsgZGlyZWN0aXZlTm9kZS5kaXJlY3RpdmVOYW1lKTtcbiAgfSxcblxuICBwYXJzZURpcmVjdGl2ZUFyZ3VtZW50czogZnVuY3Rpb24gKHBhcmFtZXRlcnMpIHtcbiAgICByZXR1cm4gcGFyYW1ldGVycy5zcGxpdCgvWyBdKy8pLmZpbHRlcihmdW5jdGlvbiAocGFyYW0pIHtcbiAgICAgIHJldHVybiBwYXJhbS5sZW5ndGggJiYgcGFyYW1bMF0gIT09IFwiLVwiO1xuICAgIH0pO1xuICB9LFxuXG4gIHBhcnNlRGlyZWN0aXZlT3B0aW9uczogZnVuY3Rpb24gKHBhcmFtZXRlcnMpIHtcbiAgICByZXR1cm4gcGFyYW1ldGVycy5zcGxpdCgvWyBdKy8pLmZpbHRlcihmdW5jdGlvbiAocGFyYW0pIHtcbiAgICAgIHJldHVybiBwYXJhbS5sZW5ndGggJiYgcGFyYW1bMF0gPT09IFwiLVwiO1xuICAgIH0pO1xuICB9LFxuXG4gIGludGVycHJldERpcmVjdGl2ZTogZnVuY3Rpb24gKGRpcmVjdGl2ZU5vZGUpIHtcbiAgICAvLyBodHRwOi8vb3JnbW9kZS5vcmcvbWFudWFsL0V4cG9ydC1vcHRpb25zLmh0bWxcbiAgICBzd2l0Y2ggKGRpcmVjdGl2ZU5vZGUuZGlyZWN0aXZlTmFtZSkge1xuICAgIGNhc2UgXCJvcHRpb25zOlwiOlxuICAgICAgdGhpcy5pbnRlcnByZXRPcHRpb25EaXJlY3RpdmUoZGlyZWN0aXZlTm9kZSk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwidGl0bGU6XCI6XG4gICAgICB0aGlzLmRvY3VtZW50LnRpdGxlID0gZGlyZWN0aXZlTm9kZS5kaXJlY3RpdmVSYXdWYWx1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJhdXRob3I6XCI6XG4gICAgICB0aGlzLmRvY3VtZW50LmF1dGhvciA9IGRpcmVjdGl2ZU5vZGUuZGlyZWN0aXZlUmF3VmFsdWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwiZW1haWw6XCI6XG4gICAgICB0aGlzLmRvY3VtZW50LmVtYWlsID0gZGlyZWN0aXZlTm9kZS5kaXJlY3RpdmVSYXdWYWx1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aGlzLmRvY3VtZW50LmRpcmVjdGl2ZVZhbHVlc1tkaXJlY3RpdmVOb2RlLmRpcmVjdGl2ZU5hbWVdID0gZGlyZWN0aXZlTm9kZS5kaXJlY3RpdmVSYXdWYWx1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfSxcblxuICBpbnRlcnByZXRPcHRpb25EaXJlY3RpdmU6IGZ1bmN0aW9uIChvcHRpb25EaXJlY3RpdmVOb2RlKSB7XG4gICAgb3B0aW9uRGlyZWN0aXZlTm9kZS5kaXJlY3RpdmVBcmd1bWVudHMuZm9yRWFjaChmdW5jdGlvbiAocGFpclN0cmluZykge1xuICAgICAgdmFyIHBhaXIgPSBwYWlyU3RyaW5nLnNwbGl0KFwiOlwiKTtcbiAgICAgIHRoaXMub3B0aW9uc1twYWlyWzBdXSA9IHRoaXMuY29udmVydExpc3B5VmFsdWUocGFpclsxXSk7XG4gICAgfSwgdGhpcyk7XG4gIH0sXG5cbiAgY29udmVydExpc3B5VmFsdWU6IGZ1bmN0aW9uIChsaXNweVZhbHVlKSB7XG4gICAgc3dpdGNoIChsaXNweVZhbHVlKSB7XG4gICAgY2FzZSBcInRcIjpcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIGNhc2UgXCJuaWxcIjpcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICBkZWZhdWx0OlxuICAgICAgaWYgKC9eWzAtOV0rJC8udGVzdChsaXNweVZhbHVlKSlcbiAgICAgICAgcmV0dXJuIHBhcnNlSW50KGxpc3B5VmFsdWUpO1xuICAgICAgcmV0dXJuIGxpc3B5VmFsdWU7XG4gICAgfVxuICB9LFxuXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyA8UGFyYWdyYXBoPiA6Oj0gPEJsYW5rPiA8TGluZT4qXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIHBhcnNlUGFyYWdyYXBoOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHBhcmFncmFwaEZpc3J0VG9rZW4gPSB0aGlzLmxleGVyLnBlZWtOZXh0VG9rZW4oKTtcbiAgICB2YXIgcGFyYWdyYXBoID0gTm9kZS5jcmVhdGVQYXJhZ3JhcGgoW10pO1xuICAgIHRoaXMuc2V0Tm9kZU9yaWdpbkZyb21Ub2tlbihwYXJhZ3JhcGgsIHBhcmFncmFwaEZpc3J0VG9rZW4pO1xuXG4gICAgdmFyIHRleHRDb250ZW50cyA9IFtdO1xuXG4gICAgd2hpbGUgKHRoaXMubGV4ZXIuaGFzTmV4dCgpKSB7XG4gICAgICB2YXIgbmV4dFRva2VuID0gdGhpcy5sZXhlci5wZWVrTmV4dFRva2VuKCk7XG4gICAgICBpZiAobmV4dFRva2VuLnR5cGUgIT09IExleGVyLnRva2Vucy5saW5lXG4gICAgICAgICAgfHwgbmV4dFRva2VuLmluZGVudGF0aW9uIDwgcGFyYWdyYXBoRmlzcnRUb2tlbi5pbmRlbnRhdGlvbilcbiAgICAgICAgYnJlYWs7XG4gICAgICB0aGlzLmxleGVyLmdldE5leHRUb2tlbigpO1xuICAgICAgdGV4dENvbnRlbnRzLnB1c2gobmV4dFRva2VuLmNvbnRlbnQpO1xuICAgIH1cblxuICAgIHBhcmFncmFwaC5hcHBlbmRDaGlsZCh0aGlzLmNyZWF0ZVRleHROb2RlKHRleHRDb250ZW50cy5qb2luKFwiXFxuXCIpKSk7XG5cbiAgICByZXR1cm4gcGFyYWdyYXBoO1xuICB9LFxuXG4gIHBhcnNlVGV4dDogZnVuY3Rpb24gKG5vRW1waGFzaXMpIHtcbiAgICB2YXIgbGluZVRva2VuID0gdGhpcy5sZXhlci5nZXROZXh0VG9rZW4oKTtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVUZXh0Tm9kZShsaW5lVG9rZW4uY29udGVudCwgbm9FbXBoYXNpcyk7XG4gIH0sXG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIDxUZXh0PiAoRE9NIExpa2UpXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIGNyZWF0ZVRleHROb2RlOiBmdW5jdGlvbiAodGV4dCwgbm9FbXBoYXNpcykge1xuICAgIHJldHVybiBub0VtcGhhc2lzID8gTm9kZS5jcmVhdGVUZXh0KG51bGwsIHsgdmFsdWU6IHRleHQgfSlcbiAgICAgIDogdGhpcy5pbmxpbmVQYXJzZXIucGFyc2VFbXBoYXNpcyh0ZXh0KTtcbiAgfVxufTtcblBhcnNlci5wcm90b3R5cGUub3JpZ2luYWxQYXJzZUVsZW1lbnQgPSBQYXJzZXIucHJvdG90eXBlLnBhcnNlRWxlbWVudDtcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBQYXJzZXIgZm9yIElubGluZSBFbGVtZW50c1xuLy9cbi8vIEByZWZzIG9yZy1lbXBoYXNpcy1yZWdleHAtY29tcG9uZW50c1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIElubGluZVBhcnNlcigpIHtcbiAgdGhpcy5wcmVFbXBoYXNpcyAgICAgPSBcIiBcXHRcXFxcKCdcXFwiXCI7XG4gIHRoaXMucG9zdEVtcGhhc2lzICAgID0gXCItIFxcdC4sOiE/OydcXFwiXFxcXClcIjtcbiAgdGhpcy5ib3JkZXJGb3JiaWRkZW4gPSBcIiBcXHRcXHJcXG4sXFxcIidcIjtcbiAgdGhpcy5ib2R5UmVnZXhwICAgICAgPSBcIltcXFxcc1xcXFxTXSo/XCI7XG4gIHRoaXMubWFya2VycyAgICAgICAgID0gXCIqL189fitcIjtcblxuICB0aGlzLmVtcGhhc2lzUGF0dGVybiA9IHRoaXMuYnVpbGRFbXBoYXNpc1BhdHRlcm4oKTtcbiAgdGhpcy5saW5rUGF0dGVybiA9IC9cXFtcXFsoW15cXF1dKilcXF0oPzpcXFsoW15cXF1dKilcXF0pP1xcXS9nOyAvLyBcXDEgPT4gbGluaywgXFwyID0+IHRleHRcbn1cblxuSW5saW5lUGFyc2VyLnByb3RvdHlwZSA9IHtcbiAgcGFyc2VFbXBoYXNpczogZnVuY3Rpb24gKHRleHQpIHtcbiAgICB2YXIgZW1waGFzaXNQYXR0ZXJuID0gdGhpcy5lbXBoYXNpc1BhdHRlcm47XG4gICAgZW1waGFzaXNQYXR0ZXJuLmxhc3RJbmRleCA9IDA7XG5cbiAgICB2YXIgcmVzdWx0ID0gW10sXG4gICAgICAgIG1hdGNoLFxuICAgICAgICBwcmV2aW91c0xhc3QgPSAwLFxuICAgICAgICBzYXZlZExhc3RJbmRleDtcblxuICAgIHdoaWxlICgobWF0Y2ggPSBlbXBoYXNpc1BhdHRlcm4uZXhlYyh0ZXh0KSkpIHtcbiAgICAgIHZhciB3aG9sZSAgPSBtYXRjaFswXTtcbiAgICAgIHZhciBwcmUgICAgPSBtYXRjaFsxXTtcbiAgICAgIHZhciBtYXJrZXIgPSBtYXRjaFsyXTtcbiAgICAgIHZhciBib2R5ICAgPSBtYXRjaFszXTtcbiAgICAgIHZhciBwb3N0ICAgPSBtYXRjaFs0XTtcblxuICAgICAge1xuICAgICAgICAvLyBwYXJzZSBsaW5rc1xuICAgICAgICB2YXIgbWF0Y2hCZWdpbiA9IGVtcGhhc2lzUGF0dGVybi5sYXN0SW5kZXggLSB3aG9sZS5sZW5ndGg7XG4gICAgICAgIHZhciBiZWZvcmVDb250ZW50ID0gdGV4dC5zdWJzdHJpbmcocHJldmlvdXNMYXN0LCBtYXRjaEJlZ2luICsgcHJlLmxlbmd0aCk7XG4gICAgICAgIHNhdmVkTGFzdEluZGV4ID0gZW1waGFzaXNQYXR0ZXJuLmxhc3RJbmRleDtcbiAgICAgICAgcmVzdWx0LnB1c2godGhpcy5wYXJzZUxpbmsoYmVmb3JlQ29udGVudCkpO1xuICAgICAgICBlbXBoYXNpc1BhdHRlcm4ubGFzdEluZGV4ID0gc2F2ZWRMYXN0SW5kZXg7XG4gICAgICB9XG5cbiAgICAgIHZhciBib2R5Tm9kZSA9IFtOb2RlLmNyZWF0ZVRleHQobnVsbCwgeyB2YWx1ZTogYm9keSB9KV07XG4gICAgICB2YXIgYm9keUNvbnRhaW5lciA9IHRoaXMuZW1waGFzaXplRWxlbWVudEJ5TWFya2VyKGJvZHlOb2RlLCBtYXJrZXIpO1xuICAgICAgcmVzdWx0LnB1c2goYm9keUNvbnRhaW5lcik7XG5cbiAgICAgIHByZXZpb3VzTGFzdCA9IGVtcGhhc2lzUGF0dGVybi5sYXN0SW5kZXggLSBwb3N0Lmxlbmd0aDtcbiAgICB9XG5cbiAgICBpZiAoZW1waGFzaXNQYXR0ZXJuLmxhc3RJbmRleCA9PT0gMCB8fFxuICAgICAgICBlbXBoYXNpc1BhdHRlcm4ubGFzdEluZGV4ICE9PSB0ZXh0Lmxlbmd0aCAtIDEpXG4gICAgICByZXN1bHQucHVzaCh0aGlzLnBhcnNlTGluayh0ZXh0LnN1YnN0cmluZyhwcmV2aW91c0xhc3QpKSk7XG5cbiAgICBpZiAocmVzdWx0Lmxlbmd0aCA9PT0gMSkge1xuICAgICAgLy8gQXZvaWQgZHVwbGljYXRlZCBpbmxpbmUgY29udGFpbmVyIHdyYXBwaW5nXG4gICAgICByZXR1cm4gcmVzdWx0WzBdO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gTm9kZS5jcmVhdGVJbmxpbmVDb250YWluZXIocmVzdWx0KTtcbiAgICB9XG4gIH0sXG5cbiAgZGVwdGg6IDAsXG4gIHBhcnNlTGluazogZnVuY3Rpb24gKHRleHQpIHtcbiAgICB2YXIgbGlua1BhdHRlcm4gPSB0aGlzLmxpbmtQYXR0ZXJuO1xuICAgIGxpbmtQYXR0ZXJuLmxhc3RJbmRleCA9IDA7XG5cbiAgICB2YXIgbWF0Y2gsXG4gICAgICAgIHJlc3VsdCA9IFtdLFxuICAgICAgICBwcmV2aW91c0xhc3QgPSAwLFxuICAgICAgICBzYXZlZExhc3RJbmRleDtcblxuICAgIHdoaWxlICgobWF0Y2ggPSBsaW5rUGF0dGVybi5leGVjKHRleHQpKSkge1xuICAgICAgdmFyIHdob2xlID0gbWF0Y2hbMF07XG4gICAgICB2YXIgc3JjICAgPSBtYXRjaFsxXTtcbiAgICAgIHZhciB0aXRsZSA9IG1hdGNoWzJdO1xuXG4gICAgICAvLyBwYXJzZSBiZWZvcmUgY29udGVudFxuICAgICAgdmFyIG1hdGNoQmVnaW4gPSBsaW5rUGF0dGVybi5sYXN0SW5kZXggLSB3aG9sZS5sZW5ndGg7XG4gICAgICB2YXIgYmVmb3JlQ29udGVudCA9IHRleHQuc3Vic3RyaW5nKHByZXZpb3VzTGFzdCwgbWF0Y2hCZWdpbik7XG4gICAgICByZXN1bHQucHVzaChOb2RlLmNyZWF0ZVRleHQobnVsbCwgeyB2YWx1ZTogYmVmb3JlQ29udGVudCB9KSk7XG5cbiAgICAgIC8vIHBhcnNlIGxpbmtcbiAgICAgIHZhciBsaW5rID0gTm9kZS5jcmVhdGVMaW5rKFtdKTtcbiAgICAgIGxpbmsuc3JjID0gc3JjO1xuICAgICAgaWYgKHRpdGxlKSB7XG4gICAgICAgIHNhdmVkTGFzdEluZGV4ID0gbGlua1BhdHRlcm4ubGFzdEluZGV4O1xuICAgICAgICBsaW5rLmFwcGVuZENoaWxkKHRoaXMucGFyc2VFbXBoYXNpcyh0aXRsZSkpO1xuICAgICAgICBsaW5rUGF0dGVybi5sYXN0SW5kZXggPSBzYXZlZExhc3RJbmRleDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxpbmsuYXBwZW5kQ2hpbGQoTm9kZS5jcmVhdGVUZXh0KG51bGwsIHsgdmFsdWU6IHNyYyB9KSk7XG4gICAgICB9XG4gICAgICByZXN1bHQucHVzaChsaW5rKTtcblxuICAgICAgcHJldmlvdXNMYXN0ID0gbGlua1BhdHRlcm4ubGFzdEluZGV4O1xuICAgIH1cblxuICAgIGlmIChsaW5rUGF0dGVybi5sYXN0SW5kZXggPT09IDAgfHxcbiAgICAgICAgbGlua1BhdHRlcm4ubGFzdEluZGV4ICE9PSB0ZXh0Lmxlbmd0aCAtIDEpXG4gICAgICByZXN1bHQucHVzaChOb2RlLmNyZWF0ZVRleHQobnVsbCwgeyB2YWx1ZTogdGV4dC5zdWJzdHJpbmcocHJldmlvdXNMYXN0KSB9KSk7XG5cbiAgICByZXR1cm4gTm9kZS5jcmVhdGVJbmxpbmVDb250YWluZXIocmVzdWx0KTtcbiAgfSxcblxuICBlbXBoYXNpemVFbGVtZW50QnlNYXJrZXI6IGZ1bmN0aW9uIChlbGVtZW50LCBtYXJrZXIpIHtcbiAgICBzd2l0Y2ggKG1hcmtlcikge1xuICAgIGNhc2UgXCIqXCI6XG4gICAgICByZXR1cm4gTm9kZS5jcmVhdGVCb2xkKGVsZW1lbnQpO1xuICAgIGNhc2UgXCIvXCI6XG4gICAgICByZXR1cm4gTm9kZS5jcmVhdGVJdGFsaWMoZWxlbWVudCk7XG4gICAgY2FzZSBcIl9cIjpcbiAgICAgIHJldHVybiBOb2RlLmNyZWF0ZVVuZGVybGluZShlbGVtZW50KTtcbiAgICBjYXNlIFwiPVwiOlxuICAgIGNhc2UgXCJ+XCI6XG4gICAgICByZXR1cm4gTm9kZS5jcmVhdGVDb2RlKGVsZW1lbnQpO1xuICAgIGNhc2UgXCIrXCI6XG4gICAgICByZXR1cm4gTm9kZS5jcmVhdGVEYXNoZWQoZWxlbWVudCk7XG4gICAgfVxuICB9LFxuXG4gIGJ1aWxkRW1waGFzaXNQYXR0ZXJuOiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIG5ldyBSZWdFeHAoXG4gICAgICBcIihbXCIgKyB0aGlzLnByZUVtcGhhc2lzICsgXCJdfF58XFxyP1xcbilcIiArICAgICAgICAgICAgICAgLy8gXFwxID0+IHByZVxuICAgICAgICBcIihbXCIgKyB0aGlzLm1hcmtlcnMgKyBcIl0pXCIgKyAgICAgICAgICAgICAgICAgICAgICAgICAvLyBcXDIgPT4gbWFya2VyXG4gICAgICAgIFwiKFteXCIgKyB0aGlzLmJvcmRlckZvcmJpZGRlbiArIFwiXXxcIiArICAgICAgICAgICAgICAgIC8vIFxcMyA9PiBib2R5XG4gICAgICAgIFwiW15cIiArIHRoaXMuYm9yZGVyRm9yYmlkZGVuICsgXCJdXCIgK1xuICAgICAgICB0aGlzLmJvZHlSZWdleHAgK1xuICAgICAgICBcIlteXCIgKyB0aGlzLmJvcmRlckZvcmJpZGRlbiArIFwiXSlcIiArXG4gICAgICAgIFwiXFxcXDJcIiArXG4gICAgICAgIFwiKFtcIiArIHRoaXMucG9zdEVtcGhhc2lzICtcIl18JHxcXHI/XFxuKVwiLCAgICAgICAgICAgICAgLy8gXFw0ID0+IHBvc3RcbiAgICAgICAgLy8gZmxhZ3NcbiAgICAgICAgXCJnXCJcbiAgICApO1xuICB9XG59O1xuXG5pZiAodHlwZW9mIGV4cG9ydHMgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgZXhwb3J0cy5QYXJzZXIgPSBQYXJzZXI7XG4gIGV4cG9ydHMuSW5saW5lUGFyc2VyID0gSW5saW5lUGFyc2VyO1xufVxuIiwiZnVuY3Rpb24gU3RyZWFtKHNlcXVlbmNlKSB7XG4gIHRoaXMuc2VxdWVuY2VzID0gc2VxdWVuY2Uuc3BsaXQoL1xccj9cXG4vKTtcbiAgdGhpcy50b3RhbExpbmVzID0gdGhpcy5zZXF1ZW5jZXMubGVuZ3RoO1xuICB0aGlzLmxpbmVOdW1iZXIgPSAwO1xufVxuXG5TdHJlYW0ucHJvdG90eXBlLnBlZWtOZXh0TGluZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRoaXMuaGFzTmV4dCgpID8gdGhpcy5zZXF1ZW5jZXNbdGhpcy5saW5lTnVtYmVyXSA6IG51bGw7XG59O1xuXG5TdHJlYW0ucHJvdG90eXBlLmdldE5leHRMaW5lID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5oYXNOZXh0KCkgPyB0aGlzLnNlcXVlbmNlc1t0aGlzLmxpbmVOdW1iZXIrK10gOiBudWxsO1xufTtcblxuU3RyZWFtLnByb3RvdHlwZS5oYXNOZXh0ID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5saW5lTnVtYmVyIDwgdGhpcy50b3RhbExpbmVzO1xufTtcblxuaWYgKHR5cGVvZiBleHBvcnRzICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gIGV4cG9ydHMuU3RyZWFtID0gU3RyZWFtO1xufVxuIiwiaW1wb3J0IHtQYXJzZXIsIENvbnZlcnRlckhUTUx9IGZyb20gJ29yZyc7XG5cbmZ1bmN0aW9uIG1haW4oKSB7XG4gIGNvbnN0IHBhcnNlciA9IG5ldyBQYXJzZXIoKTtcbiAgY29uc3QgZG9jID0gcGFyc2VyLnBhcnNlKGRvY3VtZW50LmJvZHkuaW5uZXJUZXh0KS5jb252ZXJ0KENvbnZlcnRlckhUTUwpO1xuXG4gIGRvY3VtZW50LmZpcnN0Q2hpbGQuY2xhc3NOYW1lID0gJ29yZy12aWV3ZXInO1xuXG4gIGRvY3VtZW50LmJvZHkuaW5uZXJIVE1MID1cbiAgICAnPGRpdiBjbGFzcz1cInBhZ2VcIj4nICtcbiAgICAnPGgxIGNsYXNzPVwidGl0bGVcIj48YSBocmVmPVwiI1wiPicgKyBkb2MudGl0bGUgKyAnPC9hPjwvaDE+JyArXG4gICAgJzxkaXYgY2xhc3M9XCJ0YWJsZS1vZi1jb250ZW50c1wiPicgK1xuICAgICc8aDI+VGFibGUgb2YgY29udGVudHM8L2gyPicgK1xuICAgIGRvYy50b2NIVE1MICtcbiAgICAnPC9kaXY+JyArXG4gICAgZG9jLnRpdGxlSFRNTCArXG4gICAgZG9jLnRvY0hUTUwgK1xuICAgIGRvYy5jb250ZW50SFRNTCArXG4gICAgJzwvZGl2Pic7XG4gIGRvY3VtZW50LnRpdGxlID0gZG9jLnRpdGxlO1xufVxuXG5pZiAoZG9jdW1lbnQuY29udGVudFR5cGUgPT09ICd0ZXh0L3BsYWluJykge1xuICBtYWluKCk7XG59XG4iXX0=
