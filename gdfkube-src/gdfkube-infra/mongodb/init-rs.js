let alreadyInitiated = false;
try {
  alreadyInitiated = rs.status().ok === 1;
} catch (e) {
  alreadyInitiated = false;
}

if (alreadyInitiated) {
  print("rs0 already initiated; nothing to do");
  quit(0);
}

const result = rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "mongo1:27017" },
    { _id: 1, host: "mongo2:27017" },
    { _id: 2, host: "mongo3:27017" },
  ],
});

if (result.ok !== 1) {
  print("rs.initiate failed: " + JSON.stringify(result));
  quit(1);
}

print("rs0 initiated");
