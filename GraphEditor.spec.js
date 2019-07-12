describe('GraphEditor', function() {

	// The tests here cannot test simulated user interaction with the editor.
	// All it can test is the programmatic interaction that can be done through
	// the editor interface.

	var svg;
	var editor;
	var nodeRadius = 30;
	var approachRadius = 50;
	var idProperty = 'metadataId';
	var labelProperty = 'label';
	var xProperty = 'x';
	var yProperty = 'y';

	var nodeId1 = "testnode1";
	var nodelabel1 = "mynode";
	var nodeId2 = "testnode2";
	var nodelabel2 = "yournode";

	var testNode = {};
	testNode[idProperty] = nodeId1;
	testNode[labelProperty] = nodelabel1;
	testNode[xProperty] = '200';
	testNode[yProperty] = '200';

	var testNode2 = {};
	testNode[idProperty] = nodeId2;
	testNode[labelProperty] = nodelabel2;

	var testLink = {
		'endPointA' : testNode,
		'endPointB' : testNode2,
		'isAtoB' : true
	};

	beforeEach(function() {
		svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		editor = davidkel.grapheditor.create({
			nodes : [],
			element : svg,
			'nodeRadius': nodeRadius,
			'approachRadius': approachRadius
		});
	});

	describe('Test managing links', function() {
		it('should remove a link when requested', function() {
			editor.setData({
				'nodes' : [testNode, testNode2],
				'links' : [testLink]
			});
			editor.removeLink(testLink);
			var availLinks = editor.getData().links;
			expect(availLinks.length).toBe(0);
			//TODO: Check SVG elements are removed
		});

		it('should update a link when requested', function() {
			editor.setData({
				'nodes' : [testNode, testNode2],
				'links' : [testLink]
			});
			testLink[labelProperty] = 'related to';
			editor.updateLink(testLink);
			var availLinks = editor.getData().links;
			expect(availLinks.length).toBe(1);
			expect(availLinks[0][labelProperty]).toBe("related to");
			//TODO Check SVG elements are updated
		});

	});

	describe('Test adding and removing nodes', function() {

		it('should add and remove a valid node', function() {
			editor.addNode(testNode);
			var nodeList = editor.getData().nodes;
			expect(nodeList.length).toBe(1);
			// TODO: check the SVG elements are created
			editor.removeNode(testNode);
			nodeList = editor.getData().nodes;
			expect(nodeList.length).toBe(0);
			//TODO: Check the SVG Elements are removed
		});

		it("should not allow removing an invalid node", function() {
			editor.addNode(testNode);
			var nodeList = editor.getData().nodes;
			expect(nodeList.length).toBe(1);
			editor.removeNode(testNode2);
			nodeList = editor.getData().nodes;
			expect(nodeList.length).toBe(1);
			editor.removeNode({});
			nodeList = editor.getData().nodes;
			expect(nodeList.length).toBe(1);

			var something = {};
			something[labelProperty] = nodelabel2;
			editor.removeNode(something);
			nodeList = editor.getData().nodes;
			expect(nodeList.length).toBe(1);
		});

		it('should create svg elements for all items when data is set', function() {
			//TODO: Something for the future.
		});

	});

	describe('Test simple drag handle display', function() {

		it('should make a drag handle visible/invisible', function() {
			// attach the editor to the DOM at the top to ensure
			// consistency when using the debug interface in chrome as
			// well as phantomJS
			var ttt = $('body')[0];
			ttt.insertBefore(svg, ttt.childNodes[0]);

			editor.addNode(testNode);
			var $dragHandle = $('.dragHandle');
			var $appCircle = $('.approachCircle');
			var $node = $('.nodeContainer');

			// node center = 200,200
			// mouse values offset y by -40 so y should have +40 added to them
			var mOffsetY = 40;
			var completeRadius = nodeRadius + approachRadius;

			expect($dragHandle.attr('style').indexOf('hidden') > -1).toBe(true);

			// enter the approach, but outside the node
			var evt = mouseEvent("mouseenter", 160, 160 + mOffsetY, 160, 160 + mOffsetY);

			// in phantomJS it wasn't reacting to events being dispatched onto elements
			// so here we cheat and invoke the d3 event handlers directly.
			$appCircle[0].__onmouseenter(evt);
			expect($dragHandle.attr('style').indexOf('hidden') > 1).toBe(false);

			// inside the approach, but over the node
			evt = mouseEvent("mouseleave", 185, 185 + mOffsetY, 185, 185 + mOffsetY);
			$node[0].__onmouseover(evt);
			expect($dragHandle.attr('style').indexOf('hidden') > 1).toBe(true);

			// move inside the approach, but outside the node
			evt = mouseEvent("mousemove", 165, 165 + mOffsetY, 165, 165 + mOffsetY);
			$appCircle[0].__onmousemove(evt);
			expect($dragHandle.attr('style').indexOf('hidden') > 1).toBe(false);

			// leave the approach
			evt = mouseEvent("mouseleave", 400, 400, 400, 400);
			$appCircle[0].__onmouseleave(evt);
			expect($dragHandle.attr('style').indexOf('hidden') > -1).toBe(true);

			$(svg).remove();

		});
	});

});

