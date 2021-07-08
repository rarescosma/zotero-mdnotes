/*globals Zotero, OS, require, Components, window */

const mdnotesTemplate = `
\`\`\`ad-info
title: Metadata

* title: {{title}}
* citekey: {{citekey}}
* authors: {{author}}
{{DOI}}
* links:
  {{url}}
  {{localLibrary}}
* tags: {{tags}}
\`\`\`

\`\`\`ad-abstract
{{abstractNote}}
\`\`\`

{{# if 0 }}
### Everything

<ul>
{{#each this}}
  <li>{{@key}}: {{this}}</li>
{{/each}}
</ul>
{{/if}}
`;

const zoteroNoteTemplate = `## Annotations

{{{noteContent}}}`;


function getPref(pref_name) {
  return Zotero.Prefs.get(`extensions.mdnotes.${pref_name}`, true);
}

const typemap = {
  artwork: "Illustration",
  audioRecording: "Recording",
  bill: "Legislation",
  blogPost: "Blog post",
  book: "Book",
  bookSection: "Chapter",
  case: "Legal case",
  computerProgram: "Data",
  conferencePaper: "Conference paper",
  email: "Letter",
  encyclopediaArticle: "Encyclopaedia article",
  film: "Film",
  forumPost: "Forum post",
  hearing: "Hearing",
  instantMessage: "Instant message",
  interview: "Interview",
  journalArticle: "Article",
  letter: "Letter",
  magazineArticle: "Magazine article",
  manuscript: "Manuscript",
  map: "Image",
  newspaperArticle: "Newspaper article",
  patent: "Patent",
  podcast: "Podcast",
  presentation: "Presentation",
  radioBroadcast: "Radio broadcast",
  report: "Report",
  statute: "Legislation",
  thesis: "Thesis",
  tvBroadcast: "TV broadcast",
  videoRecording: "Recording",
  webpage: "Webpage",
};

function day_of_the_month(d) {
  return (d.getDate() < 10 ? "0" : "") + d.getDate();
}

function get_month_mm_format(d) {
  return (d.getMonth() < 10 ? "0" : "") + d.getMonth();
}

function getDateAdded(item) {
  const date = new Date(item.getField("dateAdded"));
  var dateAddedStr = `${date.getFullYear()}-${get_month_mm_format(
    date
  )}-${day_of_the_month(date)}`;
  return dateAddedStr;
}

function getCiteKey(item) {
  if (typeof Zotero.BetterBibTeX === "object" && Zotero.BetterBibTeX !== null) {
    var bbtItem = Zotero.BetterBibTeX.KeyManager.get(item.getField("id"));
    return bbtItem.citekey;
  }

  return "undefined";
}

function getLocalZoteroLink(item) {
  let linksString = "zotero://select/items/";
  const library_id = item.libraryID ? item.libraryID : 0;
  linksString += `${library_id}_${item.key}`;

  return linksString;
}

function getCloudZoteroLink(item) {
  return Zotero.URI.getItemURI(item);
}

function getTags(item) {
  const tagsArray = [];
  var itemTags = item.getTags();

  if (itemTags) {
    for (const tag of itemTags) {
      tagsArray.push(tag.tag);
    }
  }

  return tagsArray;
}

function getCollectionNames(item) {
  const collectionArray = [];
  var collections = item.getCollections();

  for (let collectionID of collections) {
    var collection = Zotero.Collections.get(collectionID);
    collectionArray.push(collection.name);
  }

  return collectionArray;
}

function getRelatedItems(item) {
  var relatedItemUris = item.getRelations()["dc:relation"],
    relatedItemsArray = [];

  if (relatedItemUris) {
    for (let uri of relatedItemUris) {
      var itemID = Zotero.URI.getURIItemID(uri),
        relatedItem = Zotero.Items.get(itemID);

      // Get the link content based on settings and item type
      let linkContent;
      if (!relatedItem.isNote()) {
        linkContent = getMDNoteFileName(relatedItem);
      } else if (relatedItem.isNote() && !relatedItem.isTopLevelItem()) {
        linkContent = getZNoteFileName(relatedItem);
      } else {
        linkContent = relatedItem.getField("title");
      }

      relatedItemsArray.push(linkContent);
    }
  }

  return relatedItemsArray;
}

function getCreatorArray(item, creatorType) {
  var creators = item.getCreators();
  var creatorTypeID = Zotero.CreatorTypes.getID(creatorType);
  var creatorArray = [];

  if (creators) {
    for (let creator of creators) {
      if (creator.creatorTypeID === creatorTypeID) {
        let creatorName = `${creator.firstName} ${creator.lastName}`;
        creatorArray.push(creatorName);
      }
    }
  }
  return creatorArray;
}

function getItemMetadata(item) {
  let metadata = {};
  let fields = Zotero.ItemFields.getItemTypeFields(item.getField("itemTypeID"));
  var zoteroType = Zotero.ItemTypes.getName(item.getField("itemTypeID"));
  let creatorTypes = Zotero.Utilities.getCreatorsForType(zoteroType);

  for (let creatorType of creatorTypes) {
    let creatorArray = getCreatorArray(item, creatorType);
    metadata[creatorType] = creatorArray;
  }

  for (let x of fields) {
    let field = Zotero.ItemFields.getName(x);
    metadata[field] = item.getField(field, false, true);
  }
  metadata.itemType = typemap[zoteroType];
  metadata.citekey = getCiteKey(item);
  metadata.collections = getCollectionNames(item);
  metadata.related = getRelatedItems(item);
  metadata.tags = getTags(item);
  metadata.pdfAttachments = getZoteroAttachments(item);
  metadata.localLibrary = getLocalZoteroLink(item);
  metadata.cloudLibrary = getCloudZoteroLink(item);
  metadata.dateAdded = getDateAdded(item);
  metadata.notes = getZoteroNoteTitles(item);
  metadata.mdnotesFileName = getMDNoteFileName(item);
  metadata.metadataFileName = getZMetadataFileName(item);

  return metadata;
}

function htmlLinkToMarkdown(link) {
  const mdLink = `[${link.text}](${link.href})`;
  return mdLink;
}

function formatLists(list, bullet) {
  for (const element of list.childNodes) {
    element.innerHTML = `${bullet} ${element.innerHTML}`;
  }
}

function formatInternalLink(content, linkStyle) {
  linkStyle =
    typeof linkStyle !== "undefined" ? linkStyle : getPref("link_style");

  if (linkStyle === "wiki") {
    return `[[${content}]]`;
  } else if (linkStyle === "markdown") {
    return `[${content}](${lowerCaseDashTitle(content)})`;
  } else {
    return `${content}`;
  }
}

function lowerCaseDashTitle(content) {
  return content.replace(/\s+/g, "-").toLowerCase();
}

function getZoteroNotes(item) {
  var noteIDs = item.getNotes();
  var noteArray = [];

  if (noteIDs) {
    for (let noteID of noteIDs) {
      let note = Zotero.Items.get(noteID);
      noteArray.push(note);
    }
  }

  return noteArray;
}

function getZoteroPDFLink(attachment) {
  return `zotero://open-pdf/library/items/${attachment.key}`;
}

function getPDFFileLink(attachment) {
  let fileLink = Zotero.File.pathToFileURI(attachment.getFilePath());
  return fileLink;
}

function getZoteroAttachments(item) {
  const linkStylePref = getPref("pdf_link_style");
  let attachmentIDs = item.getAttachments();
  var linksArray = [];
  for (let id of attachmentIDs) {
    let attachment = Zotero.Items.get(id);
    if (attachment.attachmentContentType == "application/pdf") {
      let link;
      if (linkStylePref === "zotero") {
        link = getZoteroPDFLink(attachment);
      } else if (linkStylePref === "wiki") {
        link = formatInternalLink(attachment.getField("title"), "wiki");
      } else {
        link = getPDFFileLink(attachment);
      }
      linksArray.push(link);
    }
  }
  return linksArray;
}

// Hacky solution from https://stackoverflow.com/a/25047903
var isDate = function (date) {
  return new Date(date).toString() !== "Invalid Date" && !isNaN(new Date(date));
};

// From https://stackoverflow.com/a/29774197
// Return the date in yyyy-mm-dd format
function simpleISODate(date) {
  const offset = date.getTimezoneOffset();
  date = new Date(date.getTime() + offset * 60 * 1000);
  return date.toISOString().split("T")[0];
}

function formatNoteTitle(titleString) {
  var strInParenthesis = titleString.match(/\(([^\)]+)\)/g);

  if (!strInParenthesis) {
    // Just replace all slashes and colons with dashes
    return titleString.replace(/\/|:/g, "-");
  } else {
    var dateInParenthesis = strInParenthesis[0].replace(/\(|\)/g, "");

    if (isDate(dateInParenthesis)) {
      var date = new Date(dateInParenthesis);
      return titleString.replace(dateInParenthesis, simpleISODate(date));
    } else {
      return titleString;
    }
  }
}

function noteToMarkdown(item) {
  let noteContent = item.getNote();
  const domParser = Components.classes[
      "@mozilla.org/xmlextras/domparser;1"
    ].createInstance(Components.interfaces.nsIDOMParser),
    mapObj = JSON.parse(getPref("html_to_md")),
    re = new RegExp(Object.keys(mapObj).join("|"), "gi");
  var noteMD = {};
  let noteString = "";
  const fullDomNoteBody = domParser.parseFromString(noteContent, "text/html")
    .body;
  const fullDomNote = fullDomNoteBody.childNodes;

  for (let i = 0; i < fullDomNote.length; i++) {
    const para = fullDomNote[i];

    if (i === 0) {
      noteMD.title = formatNoteTitle(para.textContent);
      continue;
    }

    if (para.innerHTML) {
      for (const link of para.getElementsByTagName("a")) {
        link.outerHTML = htmlLinkToMarkdown(link);
      }

      const parsedInner = para.innerHTML.replace(re, function (matched) {
        return mapObj[matched];
      });
      para.innerHTML = parsedInner;

      if (para.innerHTML.startsWith('"#')) {
        noteString +=
          para.textContent.substring(1, para.textContent.lastIndexOf('"')) +
          "\n\n";
        continue;
      }

      if (para.innerHTML.startsWith('"')) {
        noteString += `> ${para.textContent}\n\n`;
        continue;
      }

      // Handle lists
      if (para.outerHTML.startsWith("<ul>")) {
        formatLists(para, getPref("bullet"));
      }

      if (para.outerHTML.startsWith("<ol>")) {
        formatLists(para, "1.");
      }

      noteString += para.textContent + "\n\n";
    }
  }

  noteMD.noteContent = noteString;
  noteMD.tags = getTags(item);
  noteMD.related = getRelatedItems(item);

  let parentItem = Zotero.Items.get(item.parentItemID);
  noteMD.mdnotesFileName = getMDNoteFileName(parentItem);
  noteMD.metadataFileName = getZMetadataFileName(parentItem);

  return noteMD;
}

/*
 * Get an item's base file name from setting's preferences
 */
function getFileName(item) {
  let citekeyTitle = getPref("citekey_title");

  if (citekeyTitle) {
    return getCiteKey(item);
  } else {
    // TODO add checks for Windows special characters
    if (getPref("link_style") === "wiki") {
      return item.getField("title");
    } else {
      return lowerCaseDashTitle(item.getField("title"));
    }
  }
}

/**
 * Return file names for an array of notes based on the naming convention
 *
 * @param {object} item A Zotero item
 */
function getZoteroNoteTitles(item) {
  let noteTitleArray = [];
  let noteArray = getZoteroNotes(item);

  for (let note of noteArray) {
    let noteFileName = getZNoteFileName(note);
    noteTitleArray.push(noteFileName);
  }

  return noteTitleArray;
}

/**
 * Return the file name according to the naming convention
 * @param {Item|NoteExport} item A Zotero item
 * @param {string} filePrefs The substring of the preferences to get the prefix and suffix
 */
function getNCFileName(item, filePrefs) {
  let fileName;
  if (item.isNote()) {
    let parentItem = Zotero.Items.get(item.parentItemID);
    let parentTitle = getFileName(parentItem);
    let noteTitle = item.getField("title");
    fileName = `${parentTitle} - ${noteTitle}`;
  } else {
    fileName = getFileName(item);
  }
  fileName = Zotero.File.getValidFileName(fileName);
  let prefix = getPref("files." + filePrefs + ".prefix");
  let suffix = getPref("files." + filePrefs + ".suffix");
  return `${prefix}${fileName}${suffix}`;
}

function getMDNoteFileName(item) {
  return getNCFileName(item, "mdnotes.hub");
}

function getStandaloneFileName(item) {
  return getNCFileName(item, "mdnotes.standalone");
}

/**
 * Return the file name for a Zotero note based on the naming convention
 * @param {object} item A Zotero item that isNote()
 */
function getZNoteFileName(item) {
  return getNCFileName(item, "zotero.note");
}

function getZMetadataFileName(item) {
  return getNCFileName(item, "zotero.metadata");
}

/**
 * Return the contents of an Mdnotes file based on an item's placeholders and wildcards
 * @param {item} item A Zotero item
 */

async function getMDNoteFileContents(item) {
  let metadata = getItemMetadata(item);
  let template = await readTemplate("Mdnotes Default Template");
  let fileName = metadata.mdnotesFileName;
  let formattedPlaceholders = format_placeholders(metadata);
  let hTemplate = Handlebars.compile(template);
  let content = hTemplate(formattedPlaceholders);
  content = replace_wildcards(content, metadata);
  return { content: content, name: fileName };
}

function getDefaultTemplate(fileName) {
  switch (fileName) {
    case "Mdnotes Default Template":
      return mdnotesTemplate;
    case "Zotero Note Template":
      return zoteroNoteTemplate;
  }
}

async function readTemplate(fileName) {
  let templateDir = getPref("templates.directory");

  if (templateDir === "") {
    return getDefaultTemplate(fileName);
  }

  let availableTemplates = await getTemplatesAtDirectory();
  let template;
  if (availableTemplates.includes(`${fileName}.md`)) {
    template = await Zotero.File.getContentsAsync(
      getFilePath(getPref("templates.directory"), fileName)
    );
    return template;
  } else {
    return getDefaultTemplate(fileName);
  }
}

async function getTemplatesAtDirectory() {
  let fileArray = [];
  await Zotero.File.iterateDirectory(
    getPref("templates.directory"),
    async function (entry) {
      if (
        entry.isDir ||
        entry.name.startsWith(".") ||
        !entry.name.endsWith(".md")
      ) {
        return;
      }
      fileArray.push(entry.name);
    }
  );

  return fileArray;
}

// From https://github.com/jlegewie/zotfile/blob/master/chrome/content/zotfile/utils.js#L104
function replace_wildcards(str, args) {
  return str.replace(/%\((\w+)\)/g, (match, name) => args[name]);
}

function format_placeholders(placeholders) {
  return placeholders;
}

async function getZoteroNoteFileContents(item) {
  let note = noteToMarkdown(item);
  let formattedPlaceholders = format_placeholders(note);
  let fileName = getZNoteFileName(item);
  let template = Handlebars.compile(await readTemplate("Zotero Note Template"));
  let fileContents = template(formattedPlaceholders);
  return { content: fileContents, name: fileName };
}

function getFilePath(path, filename) {
  return OS.Path.join(OS.Path.normalize(path), `${filename}.md`);
}

function getObsidianURI(fileName) {
  let uriStart = `obsidian://open?vault=${getPref("obsidian.vault")}&file=`;
  let encodedFileName = Zotero.File.encodeFilePath(fileName);

  return `${uriStart}${encodedFileName}`;
}

function itemHasAttachment(comparableField, parentItem) {
  let existingAttachments = parentItem.getAttachments();
  let linkExists = false;

  for (let id of existingAttachments) {
    let attachment = Zotero.Items.get(id);

    if (attachment.attachmentContentType === "text/markdown") {
      if (attachment.attachmentPath === comparableField) {
        linkExists = true;
        break;
      }
    } else if (
      attachment.attachmentContentType === "x-scheme-handler/obsidian"
    ) {
      if (attachment.getField("url") === comparableField) {
        linkExists = true;
        break;
      }
    }
  }
  return linkExists;
}

function getParentItem(item) {
  let parentItem;

  if (item.isNote()) {
    parentItem = Zotero.Items.get(item.parentItemID);
  } else {
    parentItem = item;
  }

  return parentItem;
}

async function addObsidianLink(outputFile, item) {
  let fileName = outputFile.split("/").pop();
  fileName = fileName.split(".")[0];
  let obsidianURI = getObsidianURI(fileName);
  let parentItem = getParentItem(item);

  if (
    !itemHasAttachment(obsidianURI, parentItem) &&
    getPref("obsidian.attach_obsidian_uri")
  ) {
    await Zotero.Attachments.linkFromURL({
      url: obsidianURI,
      contentType: "x-scheme-handler/obsidian",
      title: fileName,
      parentItemID: parentItem.id,
    });
  }
}

Zotero.Mdnotes =
  Zotero.Mdnotes ||
  new (class {
    async openPreferenceWindow(paneID, action) {
      const io = {
        pane: paneID,
        action,
      };
      window.openDialog(
        "chrome://mdnotes/content/options.xul",
        "mdnotes-options",
        "chrome,titlebar,toolbar,centerscreen" +
          Zotero.Prefs.get("browser.preferences.instantApply", true)
          ? "dialog=no"
          : "modal",
        io
      );
    }

    setPref(pref_name, value) {
      Zotero.Prefs.set(`extensions.mdnotes.${pref_name}`, value, true);
    }

    async addLinkToMDNote(outputFile, item) {
      let parentItem = getParentItem(item);

      if (
        !itemHasAttachment(outputFile, parentItem) &&
        getPref("attach_to_zotero")
      ) {
        await Zotero.Attachments.linkFromFile({
          file: outputFile,
          parentItemID: parentItem.id,
        });
      }
    }

    /**
     * Return an object with all the exportable files from a top-level item.
     * Only used for batch export.
     * @param {Item} item A Zotero item
     */
    async getFiles(item) {
      var fileArray = [];
      let mdnotesFile = await getMDNoteFileContents(item);
      fileArray.push({
        name: mdnotesFile.name,
        content: mdnotesFile.content,
      });

      let noteIDs = item.getNotes();
      if (noteIDs) {
        for (let noteID of noteIDs) {
          let note = Zotero.Items.get(noteID);
          let zotNoteFile = await getZoteroNoteFileContents(note);
          fileArray.push({
            name: zotNoteFile.name,
            content: zotNoteFile.content,
          });
        }
      }

      return fileArray;
    }

    async getSingleFileExport(item) {
      let files = await this.getFiles(item);
      var noteFileName = getMDNoteFileName(item);
      let exportFile = { name: noteFileName };
      let content = "";
      for (let file of files) {
        content += `${file.content}\n\n`;
      }

      exportFile.content = content;
      return exportFile;
    }

    async batchExportMenu() {
      var items = Zotero.getActiveZoteroPane()
        .getSelectedItems()
        .filter(
          (item) =>
            Zotero.ItemTypes.getName(item.itemTypeID) !== "attachment" &&
            Zotero.ItemTypes.getName(item.itemTypeID) !== "note"
        );
      await Zotero.Schema.schemaUpdatePromise;

      const FilePicker = require("zotero/filePicker").default;

      const fp = new FilePicker();
      var oldPath = getPref("directory")
        ? getPref("directory")
        : OS.Constants.Path.homeDir;

      if (oldPath) {
        fp.displayDirectory = oldPath;
      }

      fp.init(window, "Export markdown notes...", fp.modeGetFolder);
      const rv = await fp.show();

      if (rv === fp.returnOK) {
        for (const item of items) {
          let outputFile;
          if (getPref("file_conf") === "split") {
            const files = await this.getFiles(item);
            var noteFileName = getMDNoteFileName(item);
            for (let exportFile of files) {
              outputFile = getFilePath(fp.file, exportFile.name);
              var fileExists = await OS.File.exists(outputFile);

              if (
                exportFile.name === `${noteFileName}` &&
                (fileExists || !getPref("create_notes_file"))
              ) {
                continue;
              }
              Zotero.File.putContentsAsync(outputFile, exportFile.content);

              // Attach new notes
              this.addLinkToMDNote(outputFile, item);
              addObsidianLink(outputFile, item);
            }
          } else {
            let exportFile = await this.getSingleFileExport(item);
            outputFile = getFilePath(fp.file, exportFile.name);
            Zotero.File.putContentsAsync(outputFile, exportFile.content);

            // Attach new notes
            this.addLinkToMDNote(outputFile, item);
            addObsidianLink(outputFile, item);
          }
        }
      }
    }

    run(method, ...args) {
      this[method].apply(this, args).catch((err) => {
        Zotero.debug(err);
      });
    }
  })();
