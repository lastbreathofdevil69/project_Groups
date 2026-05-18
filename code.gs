/**
 * ============================================
 * PROJECT GROUP FORMATION 
 * Google Apps Script Backend
 * ============================================
 */

/**
 * Sheet Configuration
 */
var CONFIG = {
  STUDENT_SHEET: "Students",
  GROUP_SHEET: "Groups"
};

/**
 * ============================================
 * GET API - Routes all actions
 * ============================================
 */
function doGet(e) {
  try {
    var action = e.parameter.action || "fetch";

    if (action === "createGroup") {
      return handleCreateGroup(e);
    }

    if (action === "editGroup") {
      return handleEditGroup(e);
    }

    if (action === "deleteGroup") {
      return handleDeleteGroup(e);
    }

    // Default: return all students and groups
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var studentSheet = ss.getSheetByName(CONFIG.STUDENT_SHEET);
    var groupSheet = ss.getSheetByName(CONFIG.GROUP_SHEET);

    var students = getSheetData(studentSheet);
    var groups = getSheetData(groupSheet);

    return createJsonResponse({
      success: true,
      students: students,
      groups: groups
    });

  } catch (error) {
    return createJsonResponse({
      success: false,
      message: error.toString()
    });
  }
}

/**
 * ============================================
 * Handle Group Creation (2-4 members)
 * ============================================
 */
function handleCreateGroup(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var studentSheet = ss.getSheetByName(CONFIG.STUDENT_SHEET);
  var groupSheet = ss.getSheetByName(CONFIG.GROUP_SHEET);

  // Members come as comma-separated string
  var membersParam = e.parameter.members || "";
  var memberNames = membersParam.split(",").filter(function(n) { return n !== ""; });

  // Validate: at least 2 members, max 4
  if (memberNames.length < 2 || memberNames.length > 4) {
    throw new Error("Group must contain 2 to 4 members. Found: " + memberNames.length);
  }

  // Prevent Duplicate Members
  var unique = {};
  for (var u = 0; u < memberNames.length; u++) {
    unique[memberNames[u]] = true;
  }
  if (Object.keys(unique).length !== memberNames.length) {
    throw new Error("Duplicate members selected in same group.");
  }

  // Fetch Student Data
  var studentData = getSheetData(studentSheet);
  var studentMap = {};
  for (var s = 0; s < studentData.length; s++) {
    studentMap[studentData[s].Name] = studentData[s];
  }

  // Validate Students Exist & not already assigned
  var countA = 0;
  var countB = 0;
  for (var n = 0; n < memberNames.length; n++) {
    var student = studentMap[memberNames[n]];
    if (!student) {
      throw new Error("Student not found: " + memberNames[n]);
    }
    // Handle boolean, string "TRUE", or string "true"
    var assignedValue = student.Assigned;
    var isAssigned = (assignedValue === true || assignedValue === "TRUE" || 
                     String(assignedValue).toLowerCase() === "true");
    
    if (isAssigned) {
      throw new Error(student.Name + " is already assigned to another group.");
    }
    if (student.Category === "A") countA++;
    if (student.Category === "B") countB++;
  }

  if (countA > 2 || countB > 2) {
    throw new Error("Max 2 members per category allowed. Found: " + countA + "A and " + countB + "B.");
  }

  // Determine status (2A + 2B = Complete, anything else = Incomplete)
  var status = (memberNames.length === 4 && countA === 2 && countB === 2) ? "Complete" : "Incomplete";

  // Generate Group Number
  var nextGroupNumber = Math.max(groupSheet.getLastRow(), 1);

  // Save Group (pad empty slots for members < 4)
  groupSheet.appendRow([
    nextGroupNumber,
    memberNames[0] || "",
    memberNames[1] || "",
    memberNames[2] || "",
    memberNames[3] || "",
    countA,
    countB,
    status,
    new Date()
  ]);

  // Mark Students Assigned
  markStudentsAssigned(studentSheet, memberNames, true);

  return createJsonResponse({
    success: true,
    message: "Group created successfully.",
    groupNumber: nextGroupNumber
  });
}

/**
 * ============================================
 * Handle Group Edit (update members)
 * ============================================
 */
function handleEditGroup(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var studentSheet = ss.getSheetByName(CONFIG.STUDENT_SHEET);
  var groupSheet = ss.getSheetByName(CONFIG.GROUP_SHEET);

  var groupNumber = parseInt(e.parameter.groupNumber, 10);
  var membersParam = e.parameter.members || "";
  var newMembers = membersParam.split(",").filter(function(n) { return n !== ""; });

  if (!groupNumber) {
    throw new Error("Invalid group number.");
  }

  if (newMembers.length < 2 || newMembers.length > 4) {
    throw new Error("Group must contain 2 to 4 members. Found: " + newMembers.length);
  }

  // Prevent duplicates
  var unique = {};
  for (var u = 0; u < newMembers.length; u++) {
    unique[newMembers[u]] = true;
  }
  if (Object.keys(unique).length !== newMembers.length) {
    throw new Error("Duplicate members selected.");
  }

  // Find existing group row
  var groupData = groupSheet.getDataRange().getValues();
  var rowIndex = -1;
  var oldMembers = [];

  for (var i = 1; i < groupData.length; i++) {
    var cellValue = String(groupData[i][0] || "");
    var match = cellValue.match(/\d+/);
    var rowGroupNumber = match ? parseInt(match[0], 10) : NaN;

    if (rowGroupNumber === groupNumber) {
      rowIndex = i + 1;
      oldMembers = [groupData[i][1], groupData[i][2], groupData[i][3], groupData[i][4]].filter(function(m) { return m !== ""; });
      break;
    }
  }

  if (rowIndex === -1) {
    throw new Error("Group not found: " + groupNumber);
  }

  // FIRST: Temporarily un-assign old members to allow validation
  markStudentsAssigned(studentSheet, oldMembers, false);

  // Fetch Student Data AFTER un-assigning old members
  var studentData = getSheetData(studentSheet);
  var studentMap = {};
  for (var s = 0; s < studentData.length; s++) {
    studentMap[studentData[s].Name] = studentData[s];
  }

  // Check new members exist and are not assigned to OTHER groups
  var countA = 0;
  var countB = 0;
  var validationError = null;
  
  for (var n = 0; n < newMembers.length; n++) {
    var student = studentMap[newMembers[n]];
    if (!student) {
      validationError = "Student not found: " + newMembers[n];
      break;
    }
    // Check if assigned (now all old members are unassigned, so this correctly checks OTHER groups)
    var assignedValue = student.Assigned;
    var isAssigned = (assignedValue === true || assignedValue === "TRUE" || 
                     String(assignedValue).toLowerCase() === "true");
    
    if (isAssigned) {
      validationError = student.Name + " is already assigned to another group.";
      break;
    }
    if (student.Category === "A") countA++;
    if (student.Category === "B") countB++;
  }

  if (!validationError && (countA > 2 || countB > 2)) {
    validationError = "Max 2 members per category allowed. Found: " + countA + "A and " + countB + "B.";
  }

  // If validation failed, restore old assignments and throw error
  if (validationError) {
    markStudentsAssigned(studentSheet, oldMembers, true);
    throw new Error(validationError);
  }

  var status = (newMembers.length === 4 && countA === 2 && countB === 2) ? "Complete" : "Incomplete";

  // Assign new members
  markStudentsAssigned(studentSheet, newMembers, true);

  // Update the group row
  groupSheet.getRange(rowIndex, 2).setValue(newMembers[0] || "");
  groupSheet.getRange(rowIndex, 3).setValue(newMembers[1] || "");
  groupSheet.getRange(rowIndex, 4).setValue(newMembers[2] || "");
  groupSheet.getRange(rowIndex, 5).setValue(newMembers[3] || "");
  groupSheet.getRange(rowIndex, 6).setValue(countA);
  groupSheet.getRange(rowIndex, 7).setValue(countB);
  groupSheet.getRange(rowIndex, 8).setValue(status);
  groupSheet.getRange(rowIndex, 9).setValue(new Date());

  return createJsonResponse({
    success: true,
    message: "Group " + groupNumber + " updated successfully."
  });
}

/**
 * ============================================
 * Handle Group Deletion
 * ============================================
 */
function handleDeleteGroup(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var studentSheet = ss.getSheetByName(CONFIG.STUDENT_SHEET);
  var groupSheet = ss.getSheetByName(CONFIG.GROUP_SHEET);

  var groupNumber = parseInt(e.parameter.groupNumber, 10);
  if (!groupNumber) {
    throw new Error("Invalid group number.");
  }

  var groupData = groupSheet.getDataRange().getValues();
  var rowToDelete = -1;
  var memberNames = [];

  for (var i = 1; i < groupData.length; i++) {
    var cellValue = String(groupData[i][0] || "");
    var match = cellValue.match(/\d+/);
    var rowGroupNumber = match ? parseInt(match[0], 10) : NaN;

    if (rowGroupNumber === groupNumber) {
      rowToDelete = i + 1;
      memberNames = [groupData[i][1], groupData[i][2], groupData[i][3], groupData[i][4]].filter(function(m) { return m !== ""; });
      break;
    }
  }

  if (rowToDelete === -1) {
    throw new Error("Group not found: " + groupNumber);
  }

  groupSheet.deleteRow(rowToDelete);
  markStudentsAssigned(studentSheet, memberNames, false);

  return createJsonResponse({
    success: true,
    message: "Group " + groupNumber + " deleted successfully."
  });
}

/**
 * ============================================
 * Helper: Mark students as assigned/unassigned
 * ============================================
 */
function markStudentsAssigned(studentSheet, names, assigned) {
  var rawStudents = studentSheet.getDataRange().getValues();
  for (var r = 0; r < names.length; r++) {
    for (var i = 1; i < rawStudents.length; i++) {
      if (rawStudents[i][0] === names[r]) {
        studentSheet.getRange(i + 1, 3).setValue(assigned);
        break;
      }
    }
  }
}

/**
 * ============================================
 * Convert Sheet Data to JSON
 * ============================================
 */
function getSheetData(sheet) {
  if (!sheet) return [];

  var rows = sheet.getDataRange().getValues();
  if (rows.length === 0) return [];

  var headers = rows[0];
  var data = [];

  for (var i = 1; i < rows.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = rows[i][j];
    }
    data.push(obj);
  }

  return data;
}

/**
 * ============================================
 * JSON Response Helper
 * ============================================
 */
function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
