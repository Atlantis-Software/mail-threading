var Crud = module.exports = function() {};

// create(object, cb)
Crud.prototype.onCreate = function(createFct) {
  this._create = createFct;
};

// read(where, cb)
Crud.prototype.onRead = function(readFct) {
  this._read = readFct;
};

// update(id, object, cb)
Crud.prototype.onUpdate = function(updateFct) {
  this._update = updateFct;
};

// delete(id, cb)
Crud.prototype.onDelete = function(deleteFct) {
  this._delete = deleteFct;
};