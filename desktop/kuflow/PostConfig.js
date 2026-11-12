/**
 * KuFlow editor customisation for the diagram editor embedded in KrorDas Docs.
 * Adapted from KuFlow (github.com/samrachDX/kuflow) src/main/kuflow/editor-postconfig.js:
 * the desktop-only parts (dashboard menu, file autosave, bundled Inter font)
 * are left out. desktop/scripts/prepare-kuflow.mjs installs it as
 * js/PostConfig.js in the bundled draw.io webapp.
 */
// From the original PostConfig.js: null'ing of global vars need to be after init.js
window.ICONSEARCH_PATH = null;
window.ICON_SERVICE_PATH = null;

(function()
{
	if (typeof Editor === 'undefined' || typeof mxResources === 'undefined')
	{
		return;
	}

	Editor.prototype.appName = 'KuFlow';

	// KuFlow theme: the editor styles its chrome with CSS variables, so the
	// palette is swapped there (html:root outranks the editor's :root rules),
	// plus a few rules for spacing, radii and hover states
	var KUFLOW_THEME = 'html:root { ' +
		'--ge-panel-color: #ffffff; --toolbar-color: #ffffff; --workspace-color: #eef1f7; --header-color: #ffffff; ' +
		'--inactive-color: #f1f3f8; --active-color: #dbe2f3; --primary-color: #e3eaff; --primary-hover-color: #d3dfff; ' +
		'--accent-color: #eaefff; --accent-hover-color: #dfe7ff; --accent-text-color: #3d63f5; ' +
		'--border-color: #e4e8f1; --highlight-color: #eef1f7; --text-color: #2a3148; --strong-text-color: #10162b; ' +
		'--secondary-text-color: #6b7491; --faint-text-color: #8f98b6; --field-border-color: #d3d9e6; ' +
		'--strong-border-color: #c2cadb; --soft-color: #f4f6fb; --soft-hover-color: #eef2fb; --focus-color: #3d63f5; ' +
		'--selected-color: #e3eaff; --selected-hover-color: #d6e0ff; --dialog-color: #ffffff; --card-color: #ffffff; ' +
		'--scrollbar-color: #d6dbe7; --scrollbar-hover-color: #aab3c9; --prop-accent-color: #e3eaff; --prop-accent-text-color: #2b47c9; ' +
		'--dark-color: #0c1020; --dark-toolbar-color: #141a2e; --ge-dark-panel-color: #141a2e; --dark-header-color: #141a2e; ' +
		'--dark-border-color: #242c47; --dark-text-color: #c4cae0; --dark-strong-text-color: #e9ecf6; ' +
		'--dark-secondary-text-color: #8f98b6; --dark-accent-color: #22305f; --dark-accent-text-color: #8aa2ff; ' +
		'--dark-active-accent-color: #2b3c78; --dark-highlight-color: #0c1020; --dark-dialog-color: #181f36; ' +
		'--dark-field-color: #0f1426; --dark-field-border-color: #323b5c; --dark-card-color: #1b2340; ' +
		'--dark-soft-color: #1b2340; --dark-soft-hover-color: #222b4b; --dark-focus-color: #6683ff; } ' +
		// Toolbar and menu bar
		'.geEditor>.geToolbarContainer { border-bottom: 1px solid var(--border-color) !important; box-shadow: 0 1px 2px rgba(16,24,48,0.04); } ' +
		'.geToolbar .geButton { border-radius: 7px !important; transition: background 0.12s; } ' +
		'.geToolbar .geButton:hover:not(.mxDisabled) { background-color: var(--accent-color) !important; } ' +
		'.geMenubar>a.geItem { border-radius: 6px; padding: 4px 8px !important; font-weight: 500; } ' +
		'.geMenubar>a.geItem:hover { background: var(--accent-color) !important; color: var(--accent-text-color) !important; } ' +
		// Shape panel
		'.geSidebarContainer .geTitle { font-weight: 600 !important; letter-spacing: 0.1px; border-radius: 7px; margin: 1px 6px !important; } ' +
		'.geSidebarContainer .geTitle:hover { background-color: var(--soft-hover-color) !important; } ' +
		'.geSidebar a.geItem { border-radius: 8px !important; transition: background 0.12s, box-shadow 0.12s; } ' +
		'.geSidebar a.geItem:hover { background-color: var(--accent-color) !important; box-shadow: inset 0 0 0 1px #c9d5ff; } ' +
		'.geSidebarContainer input[type=search], .geSidebarContainer input[type=text] { border-radius: 8px !important; } ' +
		'.geSidebarFooter .gePrimaryBtn { background: #3d63f5 !important; color: #fff !important; border-radius: 8px !important; ' +
		'box-shadow: 0 6px 14px -6px rgba(61,99,245,0.7); font-weight: 600; } ' +
		'.geSidebarFooter .gePrimaryBtn span { color: #fff !important; } ' +
		// Format panel, buttons, dialogs, menus, page tabs
		'.geFormatContainer { border-left: 1px solid var(--border-color); } ' +
		'.geBtn { border-radius: 8px !important; font-weight: 500; } ' +
		'.geBtn.gePrimaryBtn, .gePrimaryBtn { background-color: #3d63f5 !important; border-color: #3d63f5 !important; color: #fff !important; } ' +
		'.geDialog { border-radius: 14px !important; box-shadow: 0 20px 50px -12px rgba(16,24,48,0.35) !important; } ' +
		'.mxPopupMenu { border-radius: 10px !important; box-shadow: 0 12px 32px -8px rgba(16,24,48,0.28) !important; border: 1px solid var(--border-color) !important; } ' +
		'.geEditor input:not(svg *, .geButton), .geEditor select { border-radius: 6px; } ' +
		'.geEditor>.geTabContainer { border-top: 1px solid var(--border-color); } ';

	// KuFlow Flowchart: the standard flowchart symbols, first in the shape
	// panel, each with its meaning as tooltip and search tags
	var FLOWCHART = [
		['Terminator (Start/End)', 'Indicates the beginning or end of a program flow in your diagram.', 'shape=mxgraph.flowchart.terminator;', 120, 50],
		['Process', 'Indicates any processing function.', 'rounded=0;', 120, 60],
		['Decision', 'Indicates a decision point between two or more paths in a flowchart.', 'shape=mxgraph.flowchart.decision;', 120, 70],
		['Delay', 'Indicates a delay in the process.', 'shape=mxgraph.flowchart.delay;', 120, 60],
		['Data (Input/Output)', 'Can represent any type of data in a flowchart, such as an input or an output.', 'shape=parallelogram;perimeter=parallelogramPerimeter;size=0.2;', 120, 60],
		['Flowline', 'Shows the direction of the process flow.', 'shape=singleArrow;arrowWidth=0.45;arrowSize=0.3;', 120, 50],
		['Connector (line)', 'Connects two symbols and shows the order of the steps.',
			'edgeStyle=orthogonalEdgeStyle;rounded=0;endArrow=block;endFill=1;endSize=8;', 100, 60, true],
		['Document', 'Indicates data that can be read by people, such as printed output.', 'shape=mxgraph.flowchart.document2;size=0.25;', 120, 60],
		['Multiple documents', 'Indicates multiple documents.', 'shape=mxgraph.flowchart.multi-document;boundedLbl=1;', 120, 64],
		['Subroutine', 'Indicates a predefined (named) process, such as a subroutine or a module.', 'shape=process;size=0.08;', 120, 60],
		['Preparation', 'Indicates a modification to a process, such as setting a switch or initializing a routine.', 'shape=hexagon;perimeter=hexagonPerimeter2;size=0.15;', 120, 60],
		['Display', 'Indicates data that is displayed for people to read, such as data on a monitor or projector screen.', 'shape=mxgraph.flowchart.display;', 120, 60],
		['Manual input', 'Indicates any operation that is performed manually (by a person).', 'shape=manualInput;size=20;boundedLbl=1;', 120, 60],
		['Manual loop', 'Indicates a sequence of commands that will continue to repeat until stopped manually.', 'shape=trapezoid;perimeter=trapezoidPerimeter;size=0.15;flipV=1;', 120, 60],
		['Loop limit', 'Indicates the start of a loop. Flip the shape vertically to indicate the end of a loop.', 'shape=mxgraph.flowchart.loop_limit;', 120, 60],
		['Stored data', 'Indicates any type of stored data.', 'shape=mxgraph.flowchart.stored_data;', 120, 60],
		['Connector (on-page)', 'Indicates an inspection point, or joins flow lines on the same page.', 'ellipse;aspect=fixed;', 60, 60],
		['Off-page connector', 'Use this shape to create a cross-reference and hyperlink from a process on one page to a process on another page.', 'shape=offPageConnector;size=0.4;', 60, 60],
		['Off-page connector (up)', 'Cross-reference to a process on another page.', 'shape=offPageConnector;size=0.4;direction=west;', 60, 60],
		['Off-page connector (left)', 'Cross-reference to a process on another page.', 'shape=offPageConnector;size=0.4;direction=south;', 60, 60],
		['Off-page connector (right)', 'Cross-reference to a process on another page.', 'shape=offPageConnector;size=0.4;direction=north;', 60, 60],
		['Or', 'Logical OR.', 'shape=mxgraph.flowchart.or_2;aspect=fixed;', 60, 60],
		['Summing junction', 'Logical AND.', 'shape=mxgraph.flowchart.summing_junction;aspect=fixed;', 60, 60],
		['Collate', 'Indicates a step that organizes data into a standard format.', 'shape=mxgraph.flowchart.collate;', 80, 80],
		['Sort', 'Indicates a step that organizes items list sequentially.', 'shape=mxgraph.flowchart.sort;', 80, 80],
		['Merge', 'Indicates a step that combines multiple sets into one.', 'triangle;direction=south;', 80, 60],
		['Database', 'Indicates a list of information with a standard structure that allows for searching and sorting.', 'shape=mxgraph.flowchart.database;', 80, 70],
		['Internal storage', 'Indicates an internal storage device.', 'shape=internalStorage;dx=12;dy=12;', 80, 80]
	];
	// Blank by default: white fill and a dark outline, recoloured in the Style panel
	var FLOWCHART_STYLE = 'whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#1F2937;strokeWidth=1.5;fontColor=#10162B;fontSize=12;';
	var FLOWLINE_STYLE = 'html=1;strokeColor=#1F2937;strokeWidth=2;fontColor=#10162B;fontSize=12;';

	if (typeof Sidebar !== 'undefined')
	{
		var sidebarInit = Sidebar.prototype.init;

		Sidebar.prototype.init = function()
		{
			sidebarInit.apply(this, arguments);

			var sb = this;

			try
			{
				this.addPaletteFunctions('kuflowFlowchart', 'KuFlow Flowchart', true, FLOWCHART.map(function(s)
				{
					var tags = 'kuflow flowchart ' + s[0].toLowerCase().replace(/[()\/]/g, ' ') + ' ' + s[1].toLowerCase();

					// Entries flagged as lines are edges (s[5])
					return s[5] ? sb.createEdgeTemplateEntry(s[2] + FLOWLINE_STYLE, s[3], s[4], '', s[0] + ': ' + s[1], null, tags) :
						sb.createVertexTemplateEntry(s[2] + FLOWCHART_STYLE, s[3], s[4], '', s[0] + ': ' + s[1], null, null, tags);
				}));

				// Moves it above the editor's own palettes, below the scratchpad
				var mine = this.palettes['kuflowFlowchart'];
				var first = this.palettes['general'];

				if (mine != null && first != null && first[0].parentNode != null)
				{
					first[0].parentNode.insertBefore(mine[0], first[0]);
					first[0].parentNode.insertBefore(mine[1], first[0]);
				}
			}
			catch (e)
			{
				console.error('KuFlow Flowchart palette', e);
			}
		};
	}

	// KuFlow mark (two linked nodes) in the editor's top left corner
	Editor.logoImage = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" ' +
		'fill="none" stroke="#fff" stroke-width="4.5" stroke-linejoin="round"><rect x="14" y="12" width="17" height="17" rx="4.5"/>' +
		'<rect x="34" y="35" width="17" height="17" rx="4.5"/><path d="M22.5 29v6.5a5 5 0 0 0 5 5H34"/></svg>');
	var style = document.createElement('style');
	style.textContent = '.geEditor, .geMenubarContainer, .geToolbarContainer, .geSidebarContainer, .geFormatContainer, .geTabContainer, ' +
		'.geFooterContainer, .mxPopupMenu, .geDialog, .geDialog input, .geDialog select, .geDialog button, .geBtn, ' +
		'.geFormatContainer input, .geFormatContainer select, .geFormatContainer button, .geSidebarContainer input ' +
		'{ font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif !important; } ' +
		'.geDiagramContainer { font-family: Helvetica, Arial, sans-serif; } ' + KUFLOW_THEME +
		'.geAppIcon { background-color: #0B1437 !important; background-size: 80% !important; border-radius: 8px; } ' +
		'a[href^="https://github.com/jgraph/"] { display: none !important; }';
	document.head.appendChild(style);

	// Product name in UI strings only: URLs (www.draw.io, draw.io/...) and
	// e-mail addresses are left as they are
	var brand = /(^|[^\w.\/@-])(draw\.io|diagrams\.net)(?![\w\/-])/g;
	var parse = mxResources.parse;

	mxResources.parse = function(text)
	{
		if (text != null)
		{
			arguments[0] = String(text).replace(brand, '$1KuFlow');
		}

		return parse.apply(this, arguments);
	};

})();
