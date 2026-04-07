/**
 * Copyright (c) 2010, Jason Davies.
 *
 * Based on Bradley White's Java version, Nicholas Yue's C++ version,
 * and Paul D. Bourke's original Fortran version.
 * See http://paulbourke.net/papers/conrec/
 */

function pointsEqual(a, b) {
  return a.x === b.x && a.y === b.y;
}

function reverseList(list) {
  var pp = list.head;
  while (pp) {
    var temp = pp.next;
    pp.next = pp.prev;
    pp.prev = temp;
    pp = temp;
  }
  var temp = list.head;
  list.head = list.tail;
  list.tail = temp;
}

function handleDegenerateCell(drawContour, sh, xh, yh, level, k) {
  var zeroCorners = [];
  for (var zi = 1; zi <= 4; zi++) {
    if (sh[zi] === 0) zeroCorners.push(zi);
  }
  if (zeroCorners.length !== 2) return false;
  var za = zeroCorners[0], zb = zeroCorners[1];
  var adjacent = (za === 1 && zb === 2) || (za === 2 && zb === 3) || (za === 3 && zb === 4) || (za === 1 && zb === 4);
  var other = [];
  for (var oi = 1; oi <= 4; oi++) {
    if (oi !== za && oi !== zb) other.push(oi);
  }
  if (adjacent) {
    if (sh[other[0]] !== 0 && sh[other[0]] === sh[other[1]]) {
      drawContour(xh[za], yh[za], xh[zb], yh[zb], level, k);
      return true;
    }
  } else if (sh[0] === 0 && sh[other[0]] * sh[other[1]] < 0) {
    drawContour(xh[za], yh[za], xh[zb], yh[zb], level, k);
    return true;
  }
  return false;
}

function ContourBuilder(level) {
  this.level = level;
  this.s = null;
}

ContourBuilder.prototype.removeSeq = function(list) {
  if (list.prev) list.prev.next = list.next;
  else this.s = list.next;
  if (list.next) list.next.prev = list.prev;
};

ContourBuilder.prototype.addSegment = function(a, b) {
  if (pointsEqual(a, b)) return;
  var ss = this.s, ma = null, mb = null, prependA = false, prependB = false;
  while (ss) {
    if (ma == null) {
      if (pointsEqual(a, ss.head.p)) { ma = ss; prependA = true; }
      else if (pointsEqual(a, ss.tail.p)) { ma = ss; }
    }
    if (mb == null) {
      if (pointsEqual(b, ss.head.p)) { mb = ss; prependB = true; }
      else if (pointsEqual(b, ss.tail.p)) { mb = ss; }
    }
    if (mb != null && ma != null) break;
    else ss = ss.next;
  }
  var c = ((ma != null) ? 1 : 0) | ((mb != null) ? 2 : 0);
  switch(c) {
    case 0:
      var aa = {p: a, prev: null};
      var bb = {p: b, next: null};
      aa.next = bb; bb.prev = aa;
      ma = {head: aa, tail: bb, next: this.s, prev: null};
      if (this.s) this.s.prev = ma;
      this.s = ma;
      break;
    case 1:
      var pp = {p: b};
      if (prependA) { pp.next = ma.head; pp.prev = null; ma.head.prev = pp; ma.head = pp; }
      else { pp.next = null; pp.prev = ma.tail; ma.tail.next = pp; ma.tail = pp; }
      break;
    case 2:
      var pp = {p: a};
      if (prependB) { pp.next = mb.head; pp.prev = null; mb.head.prev = pp; mb.head = pp; }
      else { pp.next = null; pp.prev = mb.tail; mb.tail.next = pp; mb.tail = pp; }
      break;
    case 3:
      if (ma === mb) {
        var pp = {p: ma.tail.p, next: ma.head, prev: null};
        ma.head.prev = pp; ma.head = pp;
        break;
      }
      switch((prependA ? 1 : 0) | (prependB ? 2 : 0)) {
        case 0:
          reverseList(ma);
        case 1:
          mb.tail.next = ma.head; ma.head.prev = mb.tail; mb.tail = ma.tail;
          this.removeSeq(ma);
          break;
        case 3:
          reverseList(ma);
        case 2:
          ma.tail.next = mb.head; mb.head.prev = ma.tail; ma.tail = mb.tail;
          this.removeSeq(mb);
          break;
      }
  }
};

export function Conrec(drawContour) {
  if (!drawContour) {
    var c = this;
    c.contours = {};
    this.drawContour = function(startX, startY, endX, endY, contourLevel, k) {
      var cb = c.contours[k];
      if (!cb) cb = c.contours[k] = new ContourBuilder(contourLevel);
      cb.addSegment({x: startX, y: startY}, {x: endX, y: endY});
    };
    this.contourList = function() {
      var l = [];
      var a = c.contours;
      for (var k in a) {
        var s = a[k].s;
        var level = a[k].level;
        while (s) {
          var h = s.head;
          var l2 = [];
          l2.level = level;
          l2.k = k;
          while (h && h.p) { l2.push(h.p); h = h.next; }
          l.push(l2);
          s = s.next;
        }
      }
      l.sort((a, b) => a.k - b.k);
      return l;
    };
  } else {
    this.drawContour = drawContour;
  }
  this.h = new Array(5);
  this.sh = new Array(5);
  this.xh = new Array(5);
  this.yh = new Array(5);
}

Conrec.prototype.contour = function(d, ilb, iub, jlb, jub, x, y, nc, z) {
  var h = this.h, sh = this.sh, xh = this.xh, yh = this.yh;
  var drawContour = this.drawContour;
  if (this.contours !== undefined) this.contours = {};

  var xsect = function(p1, p2) { return (h[p2]*xh[p1]-h[p1]*xh[p2])/(h[p2]-h[p1]); };
  var ysect = function(p1, p2) { return (h[p2]*yh[p1]-h[p1]*yh[p2])/(h[p2]-h[p1]); };

  var m1, m2, m3, case_value, dmin, dmax, x1=0, x2=0, y1=0, y2=0;
  var im = [0,1,1,0], jm = [0,0,1,1];
  var castab = [[[0,0,8],[0,2,5],[7,6,9]],[[0,3,4],[1,3,1],[4,3,0]],[[9,6,7],[5,2,0],[8,0,0]]];

  for (var j=(jub-1); j>=jlb; j--) {
    for (var i=ilb; i<=iub-1; i++) {
      dmin = Math.min(d[i][j], d[i][j+1], d[i+1][j], d[i+1][j+1]);
      dmax = Math.max(d[i][j], d[i][j+1], d[i+1][j], d[i+1][j+1]);
      if (dmax >= z[0] && dmin <= z[nc-1]) {
        for (var k=0; k<nc; k++) {
          if (z[k] >= dmin && z[k] <= dmax) {
            for (var m=4; m>=0; m--) {
              if (m > 0) {
                h[m] = d[i+im[m-1]][j+jm[m-1]] - z[k];
                xh[m] = x[i+im[m-1]];
                yh[m] = y[j+jm[m-1]];
              } else {
                h[0] = 0.25*(h[1]+h[2]+h[3]+h[4]);
                xh[0] = 0.5*(x[i]+x[i+1]);
                yh[0] = 0.5*(y[j]+y[j+1]);
              }
              sh[m] = h[m] > 0 ? 1 : h[m] < 0 ? -1 : 0;
            }
            if (handleDegenerateCell(drawContour, sh, xh, yh, z[k], k)) continue;
            for (m=1; m<=4; m++) {
              m1 = m; m2 = 0; m3 = m !== 4 ? m+1 : 1;
              case_value = castab[sh[m1]+1][sh[m2]+1][sh[m3]+1];
              if (case_value !== 0) {
                switch (case_value) {
                  case 1: x1=xh[m1]; y1=yh[m1]; x2=xh[m2]; y2=yh[m2]; break;
                  case 2: x1=xh[m2]; y1=yh[m2]; x2=xh[m3]; y2=yh[m3]; break;
                  case 3: x1=xh[m3]; y1=yh[m3]; x2=xh[m1]; y2=yh[m1]; break;
                  case 4: x1=xh[m1]; y1=yh[m1]; x2=xsect(m2,m3); y2=ysect(m2,m3); break;
                  case 5: x1=xh[m2]; y1=yh[m2]; x2=xsect(m3,m1); y2=ysect(m3,m1); break;
                  case 6: x1=xh[m3]; y1=yh[m3]; x2=xsect(m1,m2); y2=ysect(m1,m2); break;
                  case 7: x1=xsect(m1,m2); y1=ysect(m1,m2); x2=xsect(m2,m3); y2=ysect(m2,m3); break;
                  case 8: x1=xsect(m2,m3); y1=ysect(m2,m3); x2=xsect(m3,m1); y2=ysect(m3,m1); break;
                  case 9: x1=xsect(m3,m1); y1=ysect(m3,m1); x2=xsect(m1,m2); y2=ysect(m1,m2); break;
                }
                drawContour(x1, y1, x2, y2, z[k], k);
              }
            }
          }
        }
      }
    }
  }
};
