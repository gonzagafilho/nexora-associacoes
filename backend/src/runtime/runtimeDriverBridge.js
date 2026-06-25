const {
  getDriver: getOsDriver,
  listDrivers: listOsDrivers,
  getDefaultDriver: getOsDefaultDriver
} = require("../os/driverRegistry");

function getDriver(type, name) {
  return getOsDriver(type, name);
}

function listDrivers() {
  return listOsDrivers();
}

function getDefaultDriver(type) {
  return getOsDefaultDriver(type);
}

module.exports = {
  getDriver,
  listDrivers,
  getDefaultDriver
};
