const vscode = require("vscode");
const crypto = require("crypto");
const { exec } = require("child_process");


/**
 * Activate the extension.
 * @param {vscode.ExtensionContext} context 
 */
function activate(context) {
	const generateUidCmd = vscode.commands.registerCommand("capnp.generateUid", generateUid);

	initCapnp(context)
		.catch(err => {
			console.error(`Unable to initialize capnp: ${err}`);
			throw err;
		});

	context.subscriptions.push(generateUidCmd);
}

/**
 * 
 * @returns {Promise<boolean>} Whether or not capnp could be retrieved.
 */
async function tryGetCapnp() {
	return new Promise(res => {
		exec("capnp --version", (error, stdout) => {
			res(!error);
		})
	})
}

/**
 * Activate the extension.
 * @param {vscode.ExtensionContext} context 
 */
async function initCapnp(context) {
	const available = await tryGetCapnp();
	if (!available) {
		vscode.window.showErrorMessage(
			"Unable to execute the capnp command line tool.\n" +
			"Please ensure it is installed and in the PATH."
		);
	}
	console.log("Capnp tool is reachable");

	const diagnostics = vscode.languages.createDiagnosticCollection("capnp");
	const changeWatcher = vscode.workspace.onDidSaveTextDocument((e) => {
		if (e.fileName.endsWith(".capnp")) {
			capnpDocumentChanged(e.uri, diagnostics);
		}
	})
	vscode.workspace.findFiles("**/*.capnp")
		.then(uris => uris.forEach(x => capnpDocumentChanged(x, diagnostics)));

	context.subscriptions.push(diagnostics);
	context.subscriptions.push(changeWatcher);
}

/**
 * 
 * @param {string} str 
 * @returns {{ 
 * 		file: string, 
 * 		rowStart: number, 
 * 		rowEnd: number, 
 * 		colStart: number, 
 * 		colEnd: number,
 * 		type: string,
 * 		message: string
 * }[]}
 */
function parseCompileErrors(str) {
	// The type of regex that makes you grit your teeth.
	const regex = /\s*((?:\w:(?:\/|\\))?[^:]+):(\d+)(?:-(\d+))?(?::(\d+)(?:-(\d+))?)?:\s*([^:]*):\s*(.*)\s*/g;
	const errors = [];
	for (const match of str.matchAll(regex)) {
		const file = match["1"];
		const rowStart = match["2"] - 1;
		const rowEnd = match["3"] - 1 || rowStart;
		const colStart = match["4"] - 1;
		const colEnd = match["5"] - 1 || colStart;
		const type = match["6"];
		const message = match["7"];
		errors.push({ file, rowStart, rowEnd, colStart, colEnd, type, message });
	}
	return errors;
}

/**
 * 
 * @param {vscode.Uri} uri 
 * @param {vscode.DiagnosticCollection} diagnostics
 */
function capnpDocumentChanged(uri, diagnostics) {
	console.log("File changed - running diagnostics");

	// TODO: The fspath should be escaped.
	exec(`capnp compile ${uri.fsPath} -o-`, (error, _, stderr) => {
		const compileErrors = error ? stderr : "";
		const newDiags = parseCompileErrors(compileErrors).map(err =>
			new vscode.Diagnostic(
				new vscode.Range(err.rowStart, err.colStart, err.rowEnd, err.colEnd),
				err.message
			)
		);
		diagnostics.set(uri, newDiags);
	});
}

function generateUid(...args) {
	let uidArray = new Uint32Array(2);
	while ((uidArray[0] & 1 << 31) === 0) {
		crypto.getRandomValues(uidArray);
	}
	const upper = uidArray[0].toString(16);
	const lower = uidArray[1].toString(16).padStart(8, "0");
	const uid = `@0x${upper}${lower}`;
	insertIntoEditor(uid)
}

/**
 * 
 * @param {string} str 
 */
async function insertIntoEditor(str) {
	await vscode.window.activeTextEditor.insertSnippet({
		value: str
	})
}


module.exports = { activate }
