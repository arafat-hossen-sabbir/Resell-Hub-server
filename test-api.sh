#!/usr/bin/env bash
BASE=http://localhost:5000
cd "$(dirname "$0")"
PASS=0
FAIL=0

# ---------- helpers ----------
mk() {
  node -e "require('dotenv').config({quiet:true}); console.log(require('jsonwebtoken').sign({userId:'$1',role:'x'},process.env.JWT_SECRET,{expiresIn:'1h'}))" | tail -n 1
}

call() { # method path token [body]
  local args=(-s -w '\n%{http_code}' -X "$1" "$BASE$2" -H 'Content-Type: application/json')
  [ -n "$3" ] && args+=(-H "Authorization: Bearer $3")
  [ -n "$4" ] && args+=(-d "$4")
  local out
  out=$(curl "${args[@]}")
  CODE=$(echo "$out" | tail -n 1)
  BODY=$(echo "$out" | sed '$d')
}

field() { # JSON path, যেমন: product._id
  echo "$BODY" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const o=JSON.parse(s);const v=eval('o.'+process.argv[1]);console.log(v===undefined?'':v)}catch(e){console.log('')}})" "$1"
}

check() { # name expectedCode
  if [ "$CODE" = "$2" ]; then
    echo "PASS  $1 ($CODE)"; PASS=$((PASS+1))
  else
    echo "FAIL  $1 -> expected $2, got $CODE | $BODY"; FAIL=$((FAIL+1))
  fi
}

expect() { # name actual expected
  if [ "$2" = "$3" ]; then
    echo "PASS  $1 ($2)"; PASS=$((PASS+1))
  else
    echo "FAIL  $1 -> expected '$3', got '$2'"; FAIL=$((FAIL+1))
  fi
}

dbrun() { # node code with db variable
  node -e "require('dotenv').config({quiet:true});const {MongoClient,ObjectId}=require('mongodb');(async()=>{const c=new MongoClient(process.env.MONGODB_URI);await c.connect();const db=c.db('resellHub');$1;await c.close()})()"
}

# ---------- tokens ----------
BUYER=$(mk 650000000000000000000001)
SELLER=$(mk 650000000000000000000002)
ADMIN=$(mk 6ac782554686e72a77a56405)

echo "=== 1. Server ==="
call GET /api/health "";                 check "health" 200
call GET / "";                           check "root" 200

echo "=== 2. Auth ==="
call GET /api/users/me "";               check "me without token" 401
call GET /api/users/me "badtoken";       check "me with bad token" 401
call POST /api/users/sync "";            check "sync without firebase token" 401
call GET /api/users/me "$BUYER";         check "me as buyer" 200
expect "buyer role" "$(field user.role)" "buyer"
call GET /api/users/me "$ADMIN";         check "me as admin" 200
expect "admin role" "$(field user.role)" "admin"
call PATCH /api/users/me "$BUYER" '{"phone":"01700000000","role":"admin"}'
check "patch me" 200
expect "role cannot be changed via patch" "$(field user.role)" "buyer"

echo "=== 3. Products (create + role) ==="
PBODY='{"title":"API Test Laptop","category":"Electronics","condition":"Good","price":1000,"stock":2,"images":[],"description":"temp test product","location":"Dhaka"}'
call POST /api/products "" "$PBODY";         check "create product without token" 401
call POST /api/products "$BUYER" "$PBODY";   check "buyer cannot create product" 403
call POST /api/products "$SELLER" '{"title":"x"}'; check "missing fields" 400
call POST /api/products "$SELLER" "$PBODY";  check "seller creates product" 201
PID=$(field product._id)
expect "new product is pending" "$(field product.status)" "pending"
echo "      product id: $PID"

call GET "/api/products/$PID" "";            check "pending product hidden from public" 404
call GET /api/products/abc "";               check "invalid id" 400
call GET /api/products/my "$SELLER";         check "seller my products" 200
call PATCH "/api/products/$PID" "$BUYER" '{"title":"hack"}'
check "other user cannot edit product" 403
call PATCH "/api/products/$PID" "$SELLER" '{"price":1200}'
check "seller edits own product" 200
expect "price updated" "$(field product.price)" "1200"

echo "=== 4. Approve (script sets status directly in DB) ==="
dbrun "await db.collection('products').updateOne({_id:new ObjectId('$PID')},{\$set:{status:'approved'}})"
call GET "/api/products/$PID" "";            check "approved product visible" 200

echo "=== 5. Search / sort / pagination ==="
call GET "/api/products";                    check "list products" 200
call GET "/api/products?search=API%20Test";  check "search" 200
expect "search finds 1" "$(field pagination.totalProducts)" "1"
call GET "/api/products?category=Electronics"; check "category filter" 200
call GET "/api/products?sort=price-asc";     check "sort asc" 200
call GET "/api/products?sort=price-desc";    check "sort desc" 200
call GET "/api/products?page=1&limit=1000";  check "limit cap" 200
expect "limit capped at 50" "$(field pagination.productsPerPage)" "50"
call GET "/api/products?search=((("; check "regex chars do not crash" 200
call GET "/api/products?category%5B%24ne%5D=x"; check "injection attempt" 200
expect "injection returns nothing" "$(field pagination.totalProducts)" "0"

echo "=== 6. Wishlist ==="
call GET /api/wishlist "";                   check "wishlist without token" 401
call POST "/api/wishlist/$PID" "$BUYER";     check "add to wishlist" 201
call POST "/api/wishlist/$PID" "$BUYER";     check "duplicate wishlist" 409
call POST /api/wishlist/abc "$BUYER";        check "wishlist invalid id" 400
call GET /api/wishlist "$BUYER";             check "get wishlist" 200
expect "wishlist has the product" "$(field 'wishlist[0].product._id')" "$PID"
call DELETE "/api/wishlist/$PID" "$BUYER";   check "remove from wishlist" 200
call DELETE "/api/wishlist/$PID" "$BUYER";   check "remove again" 404

echo "=== 7. Orders ==="
OBODY="{\"productId\":\"$PID\",\"quantity\":1,\"shippingAddress\":{\"name\":\"Test\",\"phone\":\"01700000000\",\"address\":\"Dhaka\"}}"
call POST /api/orders "" "$OBODY";           check "order without token" 401
call POST /api/orders "$SELLER" "$OBODY";    check "cannot order own product" 400
call POST /api/orders "$BUYER" "{\"productId\":\"$PID\",\"quantity\":5,\"shippingAddress\":{\"name\":\"T\",\"phone\":\"1\",\"address\":\"D\"}}"
check "quantity above stock" 400
call POST /api/orders "$BUYER" "{\"productId\":\"$PID\",\"quantity\":1}"
check "missing shipping address" 400
call POST /api/orders "$BUYER" "$OBODY";     check "create order" 201
OID=$(field order._id)
echo "      order id: $OID"
call GET "/api/products/$PID" ""
expect "stock reduced to 1" "$(field product.stock)" "1"

call GET /api/orders/my-orders "$BUYER";     check "buyer orders" 200
call GET /api/orders/seller-orders "$SELLER"; check "seller orders" 200
call GET "/api/orders/$OID" "$BUYER";        check "buyer views order" 200
call GET "/api/orders/$OID" "$SELLER";       check "seller views order" 200
call GET "/api/orders/$OID" "$ADMIN";        check "stranger cannot view order" 403

call PATCH "/api/orders/$OID/status" "$BUYER" '{"orderStatus":"Accepted"}'
check "buyer cannot change status" 404
call PATCH "/api/orders/$OID/status" "$SELLER" '{"orderStatus":"Delivered"}'
check "cannot skip status steps" 400
call PATCH "/api/orders/$OID/status" "$SELLER" '{"orderStatus":"Accepted"}'
check "Pending -> Accepted" 200
call PATCH "/api/orders/$OID/status" "$SELLER" '{"orderStatus":"Processing"}'
check "Accepted -> Processing" 200
call PATCH "/api/orders/$OID/cancel" "$BUYER"
check "cannot cancel after Processing" 400

call POST /api/orders "$BUYER" "$OBODY";     check "create second order" 201
OID2=$(field order._id)
call GET "/api/products/$PID" ""
expect "stock now 0" "$(field product.stock)" "0"
call PATCH "/api/orders/$OID2/cancel" "$BUYER"; check "cancel pending order" 200
call GET "/api/products/$PID" ""
expect "stock restored to 1" "$(field product.stock)" "1"

echo "=== 8. Delete product permissions ==="
call DELETE "/api/products/$PID" "$BUYER";   check "other user cannot delete" 403
call DELETE "/api/products/$PID" "$SELLER";  check "seller deletes own product" 200

echo "=== Cleanup ==="
dbrun "await db.collection('orders').deleteMany({productId:new ObjectId('$PID')});await db.collection('wishlists').deleteMany({productId:new ObjectId('$PID')})"
echo "test data removed"

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]