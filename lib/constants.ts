export const STATUS_STYLES: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-800 border-amber-200",
  Approved: "bg-green-100 text-green-800 border-green-200",
  "Not Approved": "bg-red-100 text-red-700 border-red-200",
  Open: "border-green-200 bg-green-50 text-green-700",
  Closed: "border-gray-200 bg-gray-100 text-gray-600",
  Active: "border-red-200 bg-red-50 text-red-600",
  Resolved: "border-green-200 bg-green-50 text-green-700",
};

export const NOTIFICATION_TYPE_STYLES: Record<string, string> = {
  Announcement: "bg-[#7B1113]/10 text-[#7B1113]",
  "Status Update": "bg-blue-100 text-blue-800",
  Warning: "bg-red-100 text-red-700",
  Scholarship: "bg-green-100 text-green-800",
};

export const DOC_TYPES = ["COR", "Valid ID", "Signature Form"] as const;

export const PROGRAMS = [
  "Bachelor of Science in Civil Engineering",
  "Bachelor of Science in Electrical Engineering",
  "Bachelor of Science in Mechanical Engineering",
  "Bachelor of Science in Computer Engineering",
  "Bachelor of Science in Electronics Engineering",
  "Bachelor of Science in Computer Science",
  "Bachelor of Science in Information Technology",
  "Bachelor of Science in Criminology",
  "Bachelor of Science in Business Administration Major in Marketing Management",
  "Bachelor of Science in Business Administration Major in Financial Management",
  "Bachelor of Science in Business Administration Major in Human Resource Management",
  "Bachelor of Science in Business Administration Major in Operations Management",
  "Bachelor of Elementary Education",
  "Bachelor of Secondary Education",
  "Bachelor of Early Childhood Education",
  "Bachelor of Arts in English Language",
  "Bachelor of Arts in Political Science",
];

export const YEAR_LEVELS = ["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year"];

export const APPLICATION_STATUSES = ["Pending", "Approved", "Not Approved"] as const;

export const REQUIRED_DOCS = ["COR", "Valid ID", "Signature Form", "Academic Record"] as const;
