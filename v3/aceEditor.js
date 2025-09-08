var langTools = ace.require("ace/ext/language_tools");
var editor = ace.edit("code");
editor.setTheme("ace/theme/monokai");
var beautify;
var Range;
var customCompleter
let debouncedValidate;

function setupAceEditor()
{
if (!showDSLVersion) {
  editor.getSession().setMode("ace/mode/javascript");
} else {
  editor.getSession().setMode("ace/mode/gherkin");
  editor.setOption('useWorker', false);    // we'll do our own linting

  
  
const debouncedValidate = debounce(validateAndAnnotate, 180);

// Revalidate on edits + first load
editor.session.on('change', debouncedValidate);

}
//console.log(editor.getSession().getMode());
editor.setShowPrintMargin(true);
editor.setOptions({
  enableBasicAutocompletion: true,
  enableSnippets: true,
  enableLiveAutocompletion: true,
});

 beautify = ace.require("ace/ext/beautify"); // get reference to extension
 Range = ace.require("ace/range").Range;

// Define your keywords
const keywords = [
  "START_POS",
  "END_POS",
  "RED_POS",
  "GREEN_POS",
  "BLUE_POS",
  "RED",
  "GREEN",
  "BLUE",
];

if (!showDSLVersion) {
  keywords.push(
    "gotoPos()",
    "grab()",
    "isColor()",
    "drop()",
    "print()",
    "if(){}"
  );
} else {
  keywords.push(
    "Move",
    "robot",
    "position",
    "container",
    "grabs",
    "piece",
    "moves",
    "dropped",
    "match"
  );
}

// Create a completer
 customCompleter = {
  getCompletions: function (editor, session, pos, prefix, callback) {
    var wordList = keywords; // Use your keyword list
    callback(
      null,
      wordList.map(function (word) {
        return {
          caption: word,
          value: word,
          meta: "custom",
        };
      })
    );
  },
};

// Add the completer to the editor
langTools.setCompleters([customCompleter]);
//   ace.require("ace/ext/language_tools").addCompleter(customCompleter);
}

// Add copy event listener
editor.textInput.getElement().addEventListener("copy", function (event) {
    // Get the copied text (selected text in editor)
    const copiedText = editor.getCopyText();

    addLogInfo(sTypes.COPY, "", copiedText) 
});


// Add copy event listener
editor.textInput.getElement().addEventListener("cut", function (event) {
    // Get the copied text (selected text in editor)
    const copiedText = editor.getCopyText();

    addLogInfo(sTypes.CUT, "", copiedText) 
});

// Add copy event listener
editor.textInput.getElement().addEventListener("paste", function (event) {
    // Get the copied text (selected text in editor)
    const copiedText = editor.getCopyText();

    addLogInfo(sTypes.PASTE, "", copiedText) 
});

// EXPERIMENTS

/*

ace.config.loadModule('ace/mode/gherkin', function(m) {
    const GherkinMode = m.Mode;

    const CustomGherkinMode = function() {
        GherkinMode.call(this);

      // Add custom 'dog' keyword rule to start state
        this.addRule("start", {
            token: "keyword.dog",
            regex: "\\bdog\\b"
        });
    };

    ace.require("ace/lib/oop").inherits(CustomGherkinMode, GherkinMode);

    // Apply the custom mode to the editor
    //const editor = ace.edit("editor");
    editor.session.setMode(new CustomGherkinMode());

    // Add CSS for highlighting 'dog'
    const style = document.createElement('style');
    style.textContent = `
        .ace_keyword.dog {
            color: red;
            font-weight: bold;
            background: rgba(255, 200, 0, 0.2);
        }
    `;
    document.head.appendChild(style);
});

/*
ace.config.loadModule('ace/mode/gherkin', function(m) {
    // Get existing JavaScript Mode
    const JavaScriptMode = m.Mode;

    // Create custom mode by extending JavaScriptMode
    const CustomMode = function() {
        JavaScriptMode.call(this);
        console.log(this);
        // Get existing keyword mapper from tokenizer
        const rules = this.getTokenizer.rules;
        for (const state in rules) {
            rules[state].forEach((rule) => {
                if (rule.token === "identifier" && rule.caseInsensitive === false) {
                    // Found the keywordMapper
                    if (rule.keywordMapper) {
                        // Patch keywordMapper with new keywords
                        const oldMapper = rule.keywordMapper;
                        rule.keywordMapper = this.createKeywordMapper({
                            "keyword": "dog"  // Add "dog" as a normal keyword
                        }, "identifier");

                        // Chain original mapper to include other keywords
                        const newMapper = rule.keywordMapper;
                        rule.keywordMapper = function(value) {
                            return newMapper(value) || oldMapper(value);
                        };
                    }
                }
            });
        }
    };

    // Inherit prototype chain
    ace.require("ace/lib/oop").inherits(CustomMode, JavaScriptMode);

    // Set new mode to the editor
    
    editor.session.setMode(new CustomMode());
});*/