const route = [
  { isElevator: false, fromNode: "A", toNode: "B" }, // F1 Hallway
  { isElevator: true, fromNode: "B", toNode: "C" },  // F1 to F2 Elevator
  { isElevator: false, fromNode: "C", toNode: "D" }, // F2 Hallway
  { isElevator: false, fromNode: "D", toNode: "E" }  // F2 Dest
]

const nodes = {
  "A": { floor: 1 },
  "B": { floor: 1 },
  "C": { floor: 2 },
  "D": { floor: 2 },
  "E": { floor: 2 },
}

let newFloor = 2
let targetIndex = -1
let targetNode = null

for (let i = 0; i < route.length; i++) {
  const edge = route[i]
  const n = nodes[edge.fromNode]
  if (n && n.floor === newFloor && !edge.isElevator) {
    targetIndex = i
    targetNode = n
    break
  }
}

console.log("First loop:", { targetIndex, targetNode })

if (targetIndex === -1) {
  for (let i = 0; i < route.length; i++) {
    const n = nodes[route[i].toNode]
    if (n && n.floor === newFloor) {
      targetIndex = i
      targetNode = n
      break
    }
  }
  console.log("Fallback loop:", { targetIndex, targetNode })
}
