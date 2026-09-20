// Dedicated Web Request route. Its own production/admin authentication gates
// allow operators to inspect or stop workers before the public API cutover.
export { handleBackgroundManagement as default } from "./background/management";