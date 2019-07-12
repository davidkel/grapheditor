/*jslint browser: true, vars:true, white: true */
/*global d3*/
var davidkel =  {};

// provide the ability to move to the front of the display layer
// an svg element which will be referenced by 'this'
d3.selection.prototype.moveToFront = function() {
	return this.each(function() {
		this.parentNode.appendChild(this);
	});
};

// define a graph editor, it takes 2 types of array nodes and links.
// a node is an object with the format
// {
//		'metadataId': uniqueId
//		'label': display name
//		'x': x position
//		'y': y position
// }
// Any other data associated is metadata and will be held by the editor
//
// a link is an object with the format
// {
//		'metadataId': uniqueId
//		'endPointA': ref to node A
//		'endPointB': ref to node B
//		'label': display name
//		'isAtoB': boolean: true if direction is A to B, otherwise it is B to A
// }
davidkel.grapheditor = (function() {

	// TODO: can externalise these so we can tell the grapheditor the property names
	// property names for node objects that define where to look for information that
	// this graph editor needs, ie a unique id, a label and (x,y) co-ordinates
	var idProperty = 'metadataId';
	var labelProperty = 'label';
	var xProperty = 'x';
	var yProperty = 'y';
	// property names for link objects that define where to look for information
	var endPointAProperty = 'endPointA';
	var endPointBProperty = 'endPointB';
	var isAtoBProperty = 'isAtoB';
	var linkIdProperty = 'metadataId';

	var svg;		// d3 group containing the svg dom element
	var display;	// d3 group containing the g child of svg

	var nodeGroup;	// d3 group which represents the DOM nodes for the nodes
	var nodeDetectionGroup;
	var dragHandleGroup;
	var nodes;		// the data

	var linkGroup;  // d3 group which represents the links between nodes
	var linkTextGroup; // d3 group which represents the text links
	var links;		// the data
	var startingNode;	// the starting node when creating a link (how is this different to the selected node ?)
	var dragLine;


	var actionListener;  //object with event names and functions

	var lastNodeId = 0;	// used if you need the editor to manage in memory unique ids
	var lastLinkId = 0; // used to track the current LastLinkId found in the links
	var selectedNode;	// track the currently selected node
	var selectedLink;	// track the currently selected link
	var dragMode = 0;   // track the status of doing a node drag. (0=no drag, 1=drag start, 2=dragging)
	var dragNode;		// track the node being dragged;
	var linkDrawMode = 0; //track status if link draw mode (0=no link, 1=ready to draw, 2=drawing)
	var hoverTimeout = null;


	// some visual constants relating to node display
	var fontSize = 0;
	var nodeRadius = 0;

	// approach detection radius
	var approachRadius = 0;

	// handle editor node drag and drop.
	var drag = d3.behavior.drag()
		.on("dragstart", nodeDragStart)
		.on("drag", nodeDrag)
		.on("dragend", nodeDragEnd)
	;

	//-----------------------------------------------------------------
	// function to create the SVG Editor
	// props provide information for the editor
	// - nodes: the initial nodes to display
	// - links: the initial links to display
	// - actionListener: an object containing event names and functions
	// - nodeRadius: The radius size of a node to draw
	// - fontSize: the size of the text font inside the node
	// - element: an already existing svg element to use. if one doesn't
	//            exist, it is created as a child from an element with id
	//            of "editor".
	// - width: the width of the svg editor if it is to create the svg element
	// - height: the height of the svg editor if it is to create the svg element
	//------------------------------------------------------------------

	function create(props) {
		nodes = props && props.nodes ? props.nodes : [];
		links = props && props.links ? props.links : [];

		actionListener = props && props.actionListener ? props.actionListener : null;
		nodeRadius = props && props.nodeRadius ? parseInt(props.nodeRadius, 10) : 30;
		approachRadius = props && props.approachRadius ? parseInt(props.approachRadius, 10) : 50;
		fontSize = props && props.fontSize ? parseInt(props.fontSize, 10): 12;

		// determine the svg element to use or create one.
		var svgElement = props && props.element ? props.element : null;
		if (!svgElement) {

			// no svg element provided then we create one, but we need info on how big it should be
			var width  = props && props.width ? props.width : 960,
			height = props && props.height ? props.height: 500;

			svg = d3.select('#editor')
				.append('svg')
				.attr('width', width)
				.attr('height', height)
			;
		}
		else {
			// svgElement should be an SVG node
			svg = d3.select(svgElement);
		}

        console.log('svg', svg);
		// Define a clip path to clip text it takes the form of
		//<clipPath id="clip1">
        //   <rect x="5" y="5" width="57" height="90"/>
		//</clipPath>
		var clippath = svg.append('svg:clipPath')
			.attr('id', 'nodetextclip');
		clippath.append('svg:rect')
			.attr('height', fontSize)
			.attr('width', nodeRadius * 2 - 2)
			.attr('x', -nodeRadius)
			.attr('y', -fontSize/2)
		;

		svg
			.on('click', editorClick)
			.on('mousemove', editorMouseMove)
			.on('mouseup', editorMouseUp)
			.on('mouseleave', editorMouseOut)
		;


		// define a arrow pointer suited for the end part of a link line
		svg.append('svg:defs').append('svg:marker')
			.attr('id', 'end-arrow')
			.attr('viewBox', '0 -5 10 10')
			.attr('refX', 6)
			.attr('markerWidth', 10)
			.attr('markerHeight', 10)
			.attr('orient', 'auto')
			.append('svg:path')
				.attr('d', 'M0,-5 L10,0 L0,5')
				.attr('fill', '#000')
		;

		// define a arrow pointer suited for the beginning part of a link line
		svg.append('svg:defs').append('svg:marker')
			.attr('id', 'start-arrow')
			.attr('viewBox', '0 -5 10 10')
			.attr('refX', 4)
			.attr('markerWidth', 10)
			.attr('markerHeight', 10)
			.attr('orient', 'auto')
			.append('svg:path')
				.attr('d', 'M10,-5 L0,0 L10,5')
				.attr('fill', '#000')
		;

		// define a display group to hold all the elements in the graph
		display = svg.append('svg:g');

		// handles to the various groups of elements
		var detection = display.append('svg:g').attr('class', 'approachGroup');
		nodeDetectionGroup = detection.selectAll('g');

		var nodearea = display.append('g').attr('class', 'nodeGroup');
		nodeGroup = nodearea.selectAll('g');

		var linkAndText = display.append('svg:g').attr('class', 'linkAndTextGroup');
		linkGroup = linkAndText.selectAll('path');
		linkTextGroup = linkAndText.selectAll('text');

		var dragHandles = display.append('svg:g').attr('class', 'dragHandleGroup');
		dragHandleGroup = dragHandles.selectAll('path');

		// line displayed when dragging new nodes.
		// Lines always start from endpoint A and finish at endpoint B
		// hidden until mouse action occurs
		dragLine = display.append('svg:path')
			.attr('class', 'link dragline hidden')
			.attr('d', 'M0,0 L0,0')
		;

		// initial draw of current data
		if (nodes.length > 0) {
			processAddRemoveNodes();
			determineLastNodeId();
		}
		if (links.length > 0) {
			processAddRemoveLinks();
			determineLastLinkId();
		}

		return {
			setData: setData,
			getData: function() {return {'nodes': nodes, 'links': links};},
			addNode: addNode,
			removeNode: removeNode,
			updateLink: updateLink,
			removeLink: removeLink,
			getSvgElement: function() {return svg[0][0];},
			hideDragHandles: function() {
				dragHandleGroup.style('visibility', 'hidden');
			}
		};
	} // end create;

	//-------------------------------------------------------------------------
	// determine a numerical lastNodeId found in the editors nodes. This sets
	// an in memory value such that we can assign a unique id to a node if
	// required
	//-------------------------------------------------------------------------
	function determineLastNodeId() {
		lastNodeId = 0;
		nodes.forEach(function(node) {
			if (typeof node[idProperty] === 'number' && node[idProperty] > lastNodeId) {
				lastNodeId = node[idProperty];
			}
		});
	}

	//-------------------------------------------------------------------------
	// determine a numerical lastLinkId found in the editors links. This sets
	// an in memory value such that we can assign a unique id to a link when
	// a link is first created.
	//-------------------------------------------------------------------------
	function determineLastLinkId() {
		lastLinkId = 0;
		links.forEach(function(link) {
			if (typeof link[linkIdProperty] === 'number' && link[linkIdProperty] > lastLinkId) {
				lastLinkId = node[idProperty];
			}
		});
	}


	//------------------------------------------
	// method to set all the data for the editor
	//------------------------------------------
	function setData(newData) {
		nodes = newData && newData.nodes ? newData.nodes : [];
		links = newData && newData.links ? newData.links : [];
		determineLastNodeId();
		determineLastLinkId();
		processAddRemoveNodes();
		processAddRemoveLinks();
	}

	//-------------------------------------------
	// method to add a node to the editor
	//-------------------------------------------
	function addNode(newNode) {
		// if the node has no id, allocate it one
		if (!newNode[idProperty]) {
			newNode[idProperty] = ++lastNodeId;
		}
		nodes.push(newNode);
		processAddRemoveNodes();
	}

	//-------------------------------------------
	// method to remove a node from the editor
	//-------------------------------------------
	function removeNode(node) {

		//---------------------------------------
		// function to remove all links for a node
		//---------------------------------------
		function removeLinksForNode(node) {
			var toSplice = links.filter(function(l) {
				return (l[endPointAProperty] === node || l[endPointBProperty] === node);
			});
			toSplice.map(function(l) {
				links.splice(links.indexOf(l), 1);
			});
		}

		// if the node has no id then it isn't a valid node
		if (node[idProperty]) {
			for(var i = 0; i < nodes.length; i++) {
				if (nodes[i][idProperty] === node[idProperty]) {
					removeLinksForNode(nodes[i]);
					nodes.splice(i, 1);  // remove the node
					processAddRemoveNodes();
					processAddRemoveLinks(); //TODO: Could detect if any links have been changed
					break;
				}
			}
		}
	}

	//-------------------------------------------
	// method to update a link (eg add a name)
	//-------------------------------------------
	function updateLink(updatedLink) {
		// assume the only update will be the text for now
		linkTextGroup
			.filter(function(d) {return d === updatedLink;})
			.text(function(d) {return d[labelProperty];})
			.attr('class', 'linklabel')
		;

		// if the link id is a number it might have been changed
		// so we need to redetermine the lastLinkId
		if (typeof updatedLink[linkIdProperty] === "number") {
			determineLastLinkId();
		}
	}


	//-------------------------------------------
	// method to remove a link
	//-------------------------------------------
	function removeLink(linkToRemove) {
		links.splice(links.indexOf(linkToRemove), 1);
		processAddRemoveLinks();
	}


	//--------------------------------------
	// draw a single link from the link data
	//--------------------------------------
	function drawLink(d) {
		var deltaX = d[endPointBProperty].x - d[endPointAProperty].x,
			deltaY = d[endPointBProperty].y - d[endPointAProperty].y,
			dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY),
			normX = deltaX / dist,
			normY = deltaY / dist,
			endPointAPadding = nodeRadius + (d[isAtoBProperty] ? 0 : 5),
			endPointBPadding = nodeRadius + (d[isAtoBProperty] ? 5 : 0),
			endPointAX = d[endPointAProperty].x + (endPointAPadding * normX),
			endPointAY = d[endPointAProperty].y + (endPointAPadding * normY),
			endPointBX = d[endPointBProperty].x - (endPointBPadding * normX),
			endPointBY = d[endPointBProperty].y - (endPointBPadding * normY);
		return 'M' + endPointAX + ',' + endPointAY + 'L' + endPointBX + ',' + endPointBY;
	}

	//-------------------------------------------------
	// create the dom elements the approach circles
	//-------------------------------------------------
	function createDOMForApproachDetection(selection) {
		var approachCircle = selection.append('svg:circle')
			.attr('class', 'approachCircle')
			.style('opacity', '0')
			.attr('r', nodeRadius + approachRadius)
			.on('mouseenter', approachCircleMouseEnter)
			.on('mouseleave', approachCircleMouseLeave)
			.on('mousemove', approachCircleMouseMove)
		;

		approachCircle.attr('transform', function(d) {
			return 'translate(' + d[xProperty] + ',' + d[yProperty] + ')';
		});

	}

	//-------------------------------------------------
	// create the dom elements for drag handles
	//-------------------------------------------------
	function createDOMForDragHandle(selection) {
		// create the drag handle
		selection.append('svg:path')
			.attr('class', 'dragHandle')
			.attr('d', 'M0,-5 L10,0 L0,5')
			.style('visibility', 'hidden')
			.attr('fill', '#000')
			.on('mousedown', dragHandleMouseDown)
			.on('mouseleave', dragHandleMouseLeave)
		;

	}


	//-------------------------------------------------
	// create dom elements for nodes
	//-------------------------------------------------
	function createDOMForNodes(selection) {

		var nodeContainer = selection.append('svg:g')
			.attr('class', 'nodeContainer')
			.on('click', nodeClick)
			.on('mouseover', nodeMouseOver)
			.on('mouseout', nodeMouseOut)
			.on('mouseup', nodeMouseUp)
			.call(drag)
		;

		// create a circle
		nodeContainer.append('svg:circle')
			.attr('class', 'node')
			.attr('r', nodeRadius)
		;

		// add a rectangle to surround the text
		nodeContainer.append('svg:rect')
			.attr('class', 'nodelabelbox-hidden')
			.attr('y', -fontSize/2 - 2)
			.attr('height', fontSize + 4)
		;

		// show node labels with text clipping and repositioning
		// if the text will be clipped to show the start of the
		// text
		nodeContainer.append('svg:text')
			.attr('x', 0)
			.attr('y', 4)
			.attr('class', 'nodelabel')
			.attr('clip-path', 'url(#nodetextclip)')
			.text(function(d) { return d[labelProperty]; })
			.each(function(data) {
				if (this.getComputedTextLength() > nodeRadius * 2) {
					d3.select(this).style('text-anchor', 'start').attr('x', -nodeRadius);

				}
			})
		;

		// position node and text
		nodeContainer.attr('transform', function(d) {
			return 'translate(' + d[xProperty] + ',' + d[yProperty] + ')';
		});
	}


	//----------------------------------------------------
	// handle positioning for a single node selection
	//----------------------------------------------------
	function processNodeDisplay(node, data) {
		node
			.attr('transform', function(d) {
				return 'translate(' + d[xProperty] + ',' + d[yProperty] + ')';
			})
		;

		// find the nodes detection circle and position it
		nodeDetectionGroup.filter(function(d, i) {return d[idProperty] === data[idProperty];})
			.attr('transform', function(d) {
				return 'translate(' + d[xProperty] + ',' + d[yProperty] + ')';
			})
		;
	}

	//---------------------------------------------
	// draw all links and link labels between nodes
	//---------------------------------------------
	function processLinkDisplay() {

		// draw the links
		linkGroup
			.attr('d', drawLink)
			.classed('selected', function(d) { return d === selectedLink; })
			.style('marker-start', function(d) { return !d[isAtoBProperty] ? 'url(#start-arrow)' : ''; })
			.style('marker-end', function(d) { return d[isAtoBProperty] ? 'url(#end-arrow)' : ''; })
		;

		// reposition the text of a link
		linkTextGroup
			.call(positionLinkText)
		;

	}

	function positionLinkText(selection) {
		selection
			.attr('x', function(d) {
				var startX = d[endPointAProperty].x < d[endPointBProperty].x ? d[endPointAProperty].x : d[endPointBProperty].x;
				var moveX = d[endPointAProperty].x < d[endPointBProperty].x ? d[endPointBProperty].x - d[endPointAProperty].x : d[endPointAProperty].x - d[endPointBProperty].x;
				return startX + moveX/2;
			})
			.attr('y', function(d) {
				var startY = d[endPointAProperty].y < d[endPointBProperty].y ? d[endPointAProperty].y : d[endPointBProperty].y;
				var moveY = d[endPointAProperty].y < d[endPointBProperty].y ? d[endPointBProperty].y - d[endPointAProperty].y : d[endPointAProperty].y - d[endPointBProperty].y;
				return startY + moveY/2 - 3;
			})
		;

	}

	//-----------------------------------------------------------------------
	// add new links and remove old links by adding the required SVG elements
	// and removing the svg elements for links that don't exist anymore
	//-----------------------------------------------------------------------
	function processAddRemoveLinks() {
		linkGroup = linkGroup.data(links, function(d) { return d[linkIdProperty]; });
		linkTextGroup = linkTextGroup.data(links, function(d) { return d[linkIdProperty]; });

		// add new links lines
		linkGroup.enter().append('svg:path')
			.attr('class', 'link')
			.classed('selected', function(d) { return d === selectedLink; })
			.style('marker-start', function(d) { return !d[isAtoBProperty] ? 'url(#start-arrow)' : ''; })
			.style('marker-end', function(d) { return d[isAtoBProperty] ? 'url(#end-arrow)' : ''; })
			.on('mousedown', linkMouseDown)
			.attr('d', drawLink)
		;

		// add new link text
		linkTextGroup.enter().append('svg:text')
			.attr('class', 'linklabel')
			.text(function(d) { return d[labelProperty]; })
			.call(positionLinkText)
		;

		// remove old links
		linkGroup.exit().remove();
		linkTextGroup.exit().remove();
	}

	//-----------------------------------------------------------------------
	// add new nodes and remove old nodes by adding the required SVG elements
	// and removing the svg elements for nodes that don't exist anymore
	//-----------------------------------------------------------------------
	function processAddRemoveNodes() {

		// apply the node data all the groups that collectively represent a node
        nodeGroup = nodeGroup.data(nodes, function(d) { return d[idProperty]; });
        console.log(nodeGroup);
		nodeDetectionGroup = nodeDetectionGroup.data(nodes, function(d) { return d[idProperty]; });
		dragHandleGroup = dragHandleGroup.data(nodes, function(d) { return d[idProperty]; });

		// add new nodes
		nodeGroup.enter().call(createDOMForNodes);
		nodeDetectionGroup.enter().call(createDOMForApproachDetection);
		dragHandleGroup.enter().call(createDOMForDragHandle);

		// remove old nodes
		nodeGroup.exit().remove();
		nodeDetectionGroup.exit().remove();
		dragHandleGroup.exit().remove();
	}



	//----------------------------------------------------
	// methods that handle the D3 Drag events
	//----------------------------------------------------
	function nodeDragStart(d) {
		dragNode = d;
		dragMode = 1;
		fireEvent('nodeDragStart', this, d);
		d3.event.sourceEvent.stopPropagation();
		var sel = d3.select(this);
		sel.moveToFront();
		if (hoverTimeout !== null) {
			clearTimeout(hoverTimeout);
			hoverTimeout = null;
		}
	}

	function nodeDrag(d) {
		if ((d3.event.dx !== 0 || d3.event.dy !== 0) && dragMode) {
			dragMode = 2;
			fireEvent('nodeDrag', this, d);
			d[xProperty] += d3.event.dx;
			d[yProperty] += d3.event.dy;
			var clientRect = svg[0][0].getBoundingClientRect();
			if (d[xProperty] + nodeRadius > clientRect.width) {d[xProperty] = clientRect.width - nodeRadius;}
			if (d[xProperty] - nodeRadius < 0) {d[xProperty] = 0 + nodeRadius;}
			if (d[yProperty] + nodeRadius > clientRect.height) {d[yProperty] = clientRect.height - nodeRadius;}
			if (d[yProperty] - nodeRadius < 0) {d[yProperty] = 0 + nodeRadius;}

			var node = d3.select(this);
			processNodeDisplay(node, d);
			//TODO: could locate all links attached to the node and only process them
			processLinkDisplay();
		}
    }

    function nodeDragEnd(d) {
	if (dragMode) {
			fireEvent('nodeDragEnd', this, d);
			if (dragMode === 1) {

				// if DragStart/DragEnd with no DragMove, then assume it was a nodeClick
				// still have to fire the drag end event though
				simulateNodeClick(d, this);
			}
			dragMode = 0;
		}
	}



	//----------------------------------------------------
	// methods that handle the editor events
	//----------------------------------------------------

	function editorClick() {
		fireEvent('editorClick', this, null);
	}

	function editorMouseMove() {
		if (!linkDrawMode){
			return;
		}
		fireEvent('linkDrag', this, null);
		linkDrawMode = 2;
		d3.event.stopPropagation();


		// define the container that the d3 mouse should generate values relative
		// to. At this point it should the the svg element (which will be 'this')
		var container = this;
		// update drag line
		dragLine.attr('d', 'M' + startingNode.x + ',' + startingNode.y + 'L' + d3.mouse(container)[0] + ',' + d3.mouse(container)[1]);
	}

	function editorMouseUp() {
		if (linkDrawMode) {

			// hide drag line
			dragLine
				.classed('hidden', true)
				.style('marker-end', '')
			;
			linkDrawMode = 0;
			nodeGroup.call(drag);
			fireEvent('linkDragEnd', this, null);
		}
	}

	function editorMouseOut() {
		if (linkDrawMode) {

			// hide drag line
			dragLine
				.classed('hidden', true)
				.style('marker-end', '')
			;
			linkDrawMode = 0;
			nodeGroup.call(drag);
			fireEvent('linkDragEnd', this, null);

		}

		if (dragMode) {
			dragMode = 0;
			fireEvent('nodeDragEnd', this, dragNode);
		}

	}


	//----------------------------------------------------
	// methods that handle the link mouse events
	//----------------------------------------------------

	function linkMouseDown(d) {
		//TODO: This will require work to interact with external menu system at a future point
		fireEvent('linkClick', this, d);
		if (d === selectedLink) {
			selectedLink = null;
		}
		else {
			selectedLink = d;
		}
		selectedNode = null;
		processLinkDisplay();
	}

	// ------------------------------------------------------------
	// methods to handle the approach detection circle mouse events
	// although they are identical, they are separated into different
	// methods now in case they need to diverge in the future.
	// ------------------------------------------------------------
	function approachCircleMouseEnter(d) {
		// we have entered an approach circle, although we know which one it is we ignore
		// this and determine all the approach circles as we need to handle overlaps
		if (!linkDrawMode && !dragMode) {
			nodeDetectionGroup
				.each(checkIsInApproachCircle)
			;
		}
	}

	function approachCircleMouseLeave(d) {
		// we have exited an approach circle, although we know which one it is we ignore
		// this and determine all the approach circles as we need to handle overlaps
		if (!linkDrawMode && !dragMode) {
			nodeDetectionGroup
				.each(checkIsInApproachCircle)
			;
		}
	}


	function approachCircleMouseMove(d) {
		// we have moved within an approach circle, although we know which one it is we ignore
		// this and determine all the approach circles as we need to handle overlaps
		if (!linkDrawMode && !dragMode) {
			nodeDetectionGroup
				.each(checkIsInApproachCircle)
			;
		}
	}


	// determine if the mouse is within the provided approach circie
	// if it is display and position the drag handle
	function checkIsInApproachCircle(d) {
		if (isMouseWithinCircle(nodeRadius + approachRadius, d[xProperty], d[yProperty])) {
			// display drag handle and position it.
			setDragHandleVisibility(d, 'visible');
			positionDragHandle(d);
		} else {
			// hide the drag handle
			setDragHandleVisibility(d, 'hidden');
		}
	}


	// find the appropriate drag handle based on the data and set it's visibility
	function setDragHandleVisibility(data, state) {
		dragHandleGroup.filter(function(d, i) {return d[idProperty] === data[idProperty];})
			.style('visibility', state)
		;
	}

	// determine if mouse is within a circle of radius centered at (cx, cy)
	// using the formula x^2 + y^2 = r^2
	function isMouseWithinCircle(radius, cx, cy) {
		var rsqr = radius * radius;
		var mx = d3.mouse(svg[0][0])[0];
		var my = d3.mouse(svg[0][0])[1];
		var xsqr = (mx-cx)*(mx-cx);
		var ysqr = (my-cy)*(my-cy);
		if (xsqr + ysqr > rsqr) {
			return false;
		}
		return true;
	}

	// position the drag handle at the right point on a node and at the correct
	// rotation.
	function positionDragHandle(d) {
		var mx = d3.mouse(svg[0][0])[0];
		var my = d3.mouse(svg[0][0])[1];
		var cx = d[xProperty];
		var cy = d[yProperty];

		var yl = (cy-my);
		var xl = (mx-cx);
		var al = Math.sqrt(xl*xl + yl*yl);
		var arad = Math.asin(xl/al);
		var aDeg = toDegrees(arad);
		var dx = xl/al * nodeRadius;
		var dy = Math.sqrt(nodeRadius*nodeRadius - dx*dx);

		if (yl < 0) {
			aDeg = 90 - aDeg;
		} else {
			aDeg = 270 + aDeg;
			dy = -dy;
		}

		// locate the right drag handle and position it. (the 1 multiplier ensures coersion to number)
		dragHandleGroup.filter(function(data, i) {return d[idProperty] === data[idProperty];})
			.attr('transform', 'translate(' + (cx*1+dx) + ',' + (cy*1+dy) + ') rotate(' + aDeg + ')')
		;


		function toDegrees (angle) {
			return angle * (180 / Math.PI);
		}
		function toRadians (angle) {
			return angle * (Math.PI / 180);
		}
	}


	//----------------------------------------------------------
	// methods to deal with dragHandle events
	//----------------------------------------------------------

	// handle the start of creating a link as the drag handle has
	// been grabbed.
	function dragHandleMouseDown(d) {

		// hide the drag handle
		dragHandleGroup.style('visibility', 'hidden');

		startingNode = d;
		var container = svg[0][0];

		// reposition drag line, to center of the starting node
		// mouse move will do the actual drawing
		dragLine
			.attr('d', 'M' + startingNode.x + ',' + startingNode.y + 'L' + d3.mouse(container)[0] + ',' + d3.mouse(container)[1])
			.style('marker-end', 'url(#end-arrow)')
			.classed('hidden', false)
		;
		if (dragMode) {
			dragMode = 0;
			fireEvent('nodeDragEnd', this, d);
		}
		linkDrawMode = 1;
		fireEvent('linkDragStart', this, d);
		nodeGroup.on(".drag", null);
		if (hoverTimeout !== null) {
			clearTimeout(hoverTimeout);
			hoverTimeout = null;
		}
	}

	// handle dealing with leaving a drag handle. If it doesn't go into an approach circle
	// then hide it (for example if the mouse goes over some sort of overlay, eg a node menu)
	function dragHandleMouseLeave(d) {
		// if we are leaving the drag handle and not entering the approach circle again then
		// we should hide the drag handle
		// is it possible to leave a drag handle and enter another node's approach circle
		// and not be in our own ? I don't think so so checking just for an approach circle will be good enough
		if (d3.event.toElement.getAttribute("class") !== "approachCircle") {

			// hide the drag handle
			d3.select(this)
				.style('visibility', 'hidden')
			;
		}
	}


	//----------------------------------------------------
	// methods that handle the node mouse events
	//----------------------------------------------------

	function nodeClick(d) {
		// intercept a node click event to stop an editor click event firing.
		d3.event.stopPropagation();
	}

	//------------------------------------------------------------------------------
	// handle a click on a node, see node drag handling
	//------------------------------------------------------------------------------
	function simulateNodeClick(d, element) {
		fireEvent('nodeClick', element, d);

		// select node or unselect node
		var node = d3.select(element);

		if (selectedNode !== null) {
			fireEvent('nodeunselect', selectedNode, node.datum());
			var oldNode = d3.select(selectedNode);
			oldNode.classed('selected', false);
			if (element === selectedNode) {

				// deselecting so unselect and return
				selectedNode = null;
				return;
			}

		}

		// select the new node
		selectedNode = element;
		node.classed('selected', true);
		fireEvent('nodeselect', element, d);
	}

	// Handle mouse button up on a node which means that node is the ending node for a link
	function nodeMouseUp(d) {
		if (!linkDrawMode) {
			return;
		}
		linkDrawMode = 0;
		nodeGroup.call(drag);
		var endingNode = d;

		// hide the drag line
		dragLine
			.classed('hidden', true)
			.style('marker-end', '')
		;

		//TODO: Need to handle in the future a way to draw a link to oneself
		// but for now check for drag-to-self and do nothing
		if(endingNode === startingNode) {
			startingNode = null;
			endingNode = null;
			return;
		}

		// return the target node back to it's original display
		d3.select(this).select('.node').classed('targeted', false);

		// add link to graph (update if exists)
		//TODO: we need to support more than 1 link between the same 2 nodes in the future
		var link = links.filter(function(l) {
			return ((l[endPointAProperty] === startingNode && l[endPointBProperty] === endingNode) || (l[endPointAProperty] === endingNode && l[endPointBProperty] === startingNode));
		})[0];
		if (link) {
			// link exists so its an update if the direction has been changed.
			var isAtoB = (endingNode === link[endPointBProperty]); // true if the endpoint is B
			if (link[isAtoBProperty] !== isAtoB) {
				link[isAtoBProperty] = isAtoB;
				processLinkDisplay();
				fireEvent('linkUpdated', null, link);
			}
		} else {
			// link doesn't exist so create it.
			link = {};
			link[endPointAProperty] = startingNode;
			link[endPointBProperty] = endingNode;
			link[isAtoBProperty] = true;
			link[linkIdProperty] = ++lastLinkId;
			links.push(link);
			processAddRemoveLinks();
			fireEvent('linkCreated', null, link);
		}
		selectedNode = null;
		startingNode = null;
		endingNode = null;
	}


	function nodeMouseOver(d) {
		dragHandleGroup
			.style('visibility', 'hidden')
		;

		var that = this;
		var thatGroup = d3.select(this);

		// remove the clipping of the text
		var text = thatGroup.select('text');
		text.attr('clip-path', null); // IE only removes clipping if whole attribute is removed.

		// display the rectangle to highlight the text
		thatGroup.select('rect')
            .classed({'nodelabelbox-hidden':false, 'nodelabelbox':true})
			.attr('x', text[0][0].getBBox().x -2 )
			.attr('width',text[0][0].getComputedTextLength() + 4);

		if (linkDrawMode && startingNode !== d) {
			thatGroup.select('.node').classed('targeted', true);
		}

		if (!dragMode && !linkDrawMode) {
			hoverTimeout = setTimeout(function(){
				fireEvent('nodeHover', that, d);
			}, 1000);
		}
	}


	function nodeMouseOut(d) {
		if (isMouseWithinCircle(nodeRadius, d[xProperty], d[yProperty])) {
			return;
		}

		if (hoverTimeout !== null) {
			clearTimeout(hoverTimeout);
			hoverTimeout = null;
		}

		if (linkDrawMode) {
			d3.select(this).select('.node').classed('targeted', false);
		}

		// hide the rectangle and reimplement the clip
		var thatGroup = d3.select(this);
		thatGroup.select('rect')
			.classed({'nodelabelbox-hidden':true, 'nodelabelbox':false})
		;
		thatGroup.select('text')
			.attr('clip-path', 'url(#nodetextclip)')
		;
	}

	//----------------------------------------------------
	// generic event firing method
	//----------------------------------------------------
	function fireEvent(eventName, element, data) {
		if (actionListener !== null && actionListener[eventName] && typeof actionListener[eventName] === "function") {
			actionListener[eventName](element, data, d3.event);
		}
		if (actionListener !== null && actionListener.event && typeof actionListener.event === "function") {
			actionListener.event(eventName, element, data, d3.event);
		}
	}

	return {
		create: create
	};

}());
