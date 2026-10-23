/* Interactive questions (typed numbers, estimates, code, bugs, shapes, sorting and more) appended to lessons that
   already shipped. Loaded after content-extra.js. Like content-extra.js, each entry names its unit index and
   lesson title, and is skipped if they don't match; questions are only ever appended to the END of a lesson,
   so existing ids (u{ui}l{li}q{n}) never move. At most 2 entries per lesson, so lessons stay short.
   The formats are documented in README.md ("Questions"); every code output here was run with Python. */
(function (C) {
const Q = [
/* ---------------- Python Refresher (unit 1) ---------------- */
[1, "Variables and Types", {type:"output", p:"What does this print?",
  code:`x = 5
y = x
x = x + 2
print(x, y)`,
  answer:"7 5", why:"`y = x` copies the value 5 into y. Rebinding x afterwards doesn't touch y."}],
[1, "Variables and Types", {type:"match", mono:true, p:"Match each expression to what `type()` returns",
  pairs:[["type(3)","<class 'int'>"],["type(3.0)","<class 'float'>"],["type('3')","<class 'str'>"],["type([3])","<class 'list'>"]],
  why:"A decimal point makes a float, quotes make a string and square brackets make a list."}],
[1, "Numbers That Change", {type:"output", p:"What does this print?",
  code:`print(7 // 2, 7 % 2, -7 // 2)`,
  answer:"3 1 -4", why:"`//` floors toward minus infinity, so -7 // 2 is -4, not -3. `%` gives the remainder."}],
[1, "When Python Complains", {type:"bug", p:"This raises a TypeError. Tap the line that causes it.",
  code:`age = 30
msg = "Age: " + age
print(msg)`,
  line:2, fix:{opts:['msg = "Age: " + str(age)','msg = "Age: " + int(age)','msg = "Age: " - age']},
  why:"Python won't join a str and an int with `+`. Convert with `str(age)` or use an f-string."}],
[1, "Strings and f-strings", {type:"output", p:"What does this print?",
  code:`name = "Ada"
n = 3
print(f"{name} has {n * 2} cats")
print(name[1:])`,
  answer:"Ada has 6 cats\nda", why:"f-strings evaluate the expression inside `{}`. `name[1:]` drops the first character."}],
[1, "Strings and f-strings", {type:"match", mono:true, p:"With `s = \"hello\"`, match each expression to its value",
  pairs:[["s.upper()","'HELLO'"],["s[::-1]","'olleh'"],["len(s)","5"],["s.find('l')","2"]],
  why:"`[::-1]` reverses, and `find` returns the index of the first match (counting from 0)."}],
[1, "Comparisons and Booleans", {type:"bug", p:"This won't even run. Tap the broken line.",
  code:`def is_even(n):
    if n % 2 = 0:
        return True
    return False`,
  line:2, fix:{opts:["if n % 2 == 0:","if n % 2 is 0:","if n % 2 =< 0:"]},
  why:"`=` assigns and `==` compares. `is` checks identity, which only happens to work for small ints."}],
[1, "Comparisons and Booleans", {type:"match", mono:true, p:"Match each expression to its value",
  pairs:[["1 < 2 < 3","True"],["bool([])","False"],["None or 5","5"],["0 and 1/0","0"]],
  why:"Comparisons chain, empty containers are falsy, and `and`/`or` return an operand, stopping as soon as the answer is known, so 1/0 never runs."}],
[1, "If, Elif, Else", {type:"output", p:"What does this print?",
  code:`score = 95
if score >= 50:
    print("pass")
elif score >= 90:
    print("distinction")
else:
    print("fail")`,
  answer:"pass", why:"Only the first true branch runs. 95 >= 50 is true, so the `elif` is never checked. Test the stricter condition first."}],
[1, "Lists and Indexing", {type:"output", p:"What does this print?",
  code:`a = [1, 2, 3]
b = a
b.append(4)
print(a)`,
  answer:"[1, 2, 3, 4]", why:"`b = a` makes a second name for the same list, so appending through b changes a too. Use `a.copy()` for a real copy."}],
[1, "Lists and Indexing", {type:"match", mono:true, p:"With `a = [10, 20, 30, 40]`, match each expression to its value",
  pairs:[["a[-1]","40"],["a[1:3]","[20, 30]"],["a[::2]","[10, 30]"],["a[:1]","[10]"]],
  why:"Negative indexes count from the end; slices stop before the end index; a step of 2 takes every other item."}],
[1, "Slicing and Changing Lists", {type:"bug", p:"This should print the last two numbers, `[3, 4]`. Tap the wrong line.",
  code:`nums = [1, 2, 3, 4]
last_two = nums[2:3]
print(last_two)`,
  line:2, fix:{opts:["last_two = nums[-2:]","last_two = nums[3:4]","last_two = nums[-2:-1]"]},
  why:"A slice stops before its end index, so `[2:3]` is just `[3]`. `nums[-2:]` takes the last two whatever the length."}],
[1, "Loops That Do Something", {type:"output", p:"What does this print?",
  code:`total = 0
for x in [3, 1, 4, 1]:
    if x > 1:
        total += x
print(total)`,
  answer:"7", why:"Only 3 and 4 are greater than 1, so total = 3 + 4."}],
[1, "Loops That Do Something", {type:"type", norm:"code", p:"Complete the comprehension so `squares` is `[1, 4, 9]` for `nums = [1, 2, 3]`",
  code:`squares = [___ for x in nums]`,
  answers:["x*x","x**2","pow(x,2)"], why:"The expression before `for` is what each item becomes: `x * x` or `x ** 2`."}],
[1, "Range, Enumerate, Zip", {type:"output", p:"What does this print?",
  code:`for i, ch in enumerate("ab", start=1):
    print(i, ch)`,
  answer:"1 a\n2 b", why:"`enumerate` pairs each item with a counter; `start=1` makes the counter begin at 1."}],
[1, "Range, Enumerate, Zip", {type:"blanks", p:"Print each name with its age",
  code:`names = ["ana", "bo"]
ages = [31, 27]
for name, age in {0}(names, ages):
    print(name, {1})`,
  blanks:[["zip","enumerate","range"],["age","ages","ages[age]"]],
  why:"`zip` walks two lists side by side, giving one item from each per step."}],
[1, "While, Break, Continue", {type:"bug", p:"This should count down from 10 to 1, but it never stops. Tap the bug.",
  code:`i = 10
while i > 0:
    print(i)
    i += 1`,
  line:4, fix:{opts:["i -= 1","i = 0","i += 2"]},
  why:"The loop runs while i > 0, so i has to move toward 0. Adding makes it grow forever."}],
[1, "While, Break, Continue", {type:"output", p:"What does this print?",
  code:`for n in range(6):
    if n == 4:
        break
    if n % 2 == 0:
        continue
    print(n)`,
  answer:"1\n3", why:"`continue` skips the even numbers 0 and 2; `break` stops the loop at 4 before it prints."}],
[1, "Comprehensions", {type:"output", p:"What does this print?",
  code:`print([x * x for x in range(5) if x % 2 == 0])`,
  answer:"[0, 4, 16]", why:"range(5) is 0..4; the filter keeps 0, 2 and 4, which are then squared."}],
[1, "Comprehensions", {type:"match", mono:true, p:"Match each comprehension to its value",
  pairs:[["[x for x in range(4)]","[0, 1, 2, 3]"],["{x % 2 for x in range(4)}","{0, 1}"],["{x: x*x for x in range(3)}","{0: 0, 1: 1, 2: 4}"],["sum(x for x in range(4))","6"]],
  why:"Square brackets build a list, braces with one value build a set (duplicates collapse), and braces with `key: value` build a dict."}],
[1, "Dicts and Lookups", {type:"output", p:"What does this print?",
  code:`counts = {}
for w in "a b a c a".split():
    counts[w] = counts.get(w, 0) + 1
print(counts["a"], len(counts))`,
  answer:"3 3", why:"\"a\" appears 3 times, and there are 3 distinct keys: a, b and c. `get(w, 0)` returns 0 for a word not seen yet."}],
[1, "Dicts and Lookups", {type:"blanks", p:"Look up a missing key safely, then loop over key-value pairs",
  code:`stock = {"apple": 3}
n = stock.{0}("pear", 0)
for fruit, qty in stock.{1}():
    print(fruit, qty)`,
  blanks:[["get","pop","find"],["items","keys","values"]],
  why:"`get(key, default)` never raises KeyError. `items()` yields (key, value) pairs to unpack."}],
[1, "Tuples and Nested Data", {type:"type", norm:"code", p:"Complete the indexing so this prints 3",
  code:`grid = [[1, 2], [3, 4]]
print(grid___)`,
  answers:["[1][0]"], why:"The outer index picks the row ([3, 4]); the inner index picks the column (3)."}],
[1, "Tuples and Nested Data", {type:"match", mono:true, p:"With `d = {\"a\": 1, \"b\": 2}`, match each expression to its value",
  pairs:[["d.get('c', 0)","0"],["list(d)","['a', 'b']"],["'a' in d","True"],["len(d)","2"]],
  why:"Iterating a dict (or calling list on it) gives its keys, and `in` checks keys, not values."}],
[1, "Functions and Returns", {type:"output", p:"What does this print?",
  code:`def double(x):
    x = x * 2

result = double(5)
print(result)`,
  opts:["None","10","5","An error"], why:"The function has no `return`, so it returns None. Changing x inside doesn't send anything back."}],
[1, "Arguments With Names", {type:"output", p:"What does this print?",
  code:`def add(item, bag=[]):
    bag.append(item)
    return bag

add(1)
print(add(2))`,
  answer:"[1, 2]", why:"A default value is created once, when the function is defined, so every call shares the same list. Use `bag=None` and create a new list inside."}],
[1, "Objects, Methods, Attributes", {type:"blanks", p:"Finish the class so `c.tick()` adds 1 to `c.n`",
  code:`class Counter:
    def __init__({0}):
        self.n = 0

    def tick(self):
        {1} += 1`,
  blanks:[["self","cls","this"],["self.n","n","Counter.n"]],
  why:"Methods receive the instance as their first parameter, `self`, and attributes live on it as `self.n`."}],
[1, "NumPy Arrays", {type:"blanks", p:"Get one score per row of X, then their mean",
  code:`import numpy as np
X = np.ones((32, 10))
w = np.zeros(10)
scores = X {0} w          # shape (32,)
mean = scores.mean(axis={1})`,
  blanks:[["@","*","+"],["0","1","2"]],
  why:"`@` is a matrix product: (32, 10) @ (10,) gives (32,). `*` would broadcast to (32, 10). A 1-D array only has axis 0."}],
[1, "NumPy Arrays", {type:"dims", p:"What shape does `a + b` have?",
  code:`a = np.zeros((32, 1))
b = np.zeros((1, 10))`,
  answer:["32","10"], chips:["1","10","32","320"],
  why:"Broadcasting stretches each size-1 axis to match the other array: (32, 1) and (1, 10) give (32, 10)."}],
[1, "Pandas DataFrames", {type:"match", mono:true, p:"With this DataFrame, match each expression to its value",
  code:`df = pd.DataFrame({"a": [1, 2, 3], "b": [4, 5, 6]})`,
  pairs:[["df.shape","(3, 2)"],["df['a'].sum()","6"],["len(df.columns)","2"],["df.iloc[0, 1]","4"]],
  why:"shape is (rows, columns); `iloc[0, 1]` is row 0, column 1 by position, which is b's first value."}],

/* ---------------- Coding Foundations (unit 18) ---------------- */
[18, "Big-O Basics", {type:"bigo", p:"Time and extra space of this function?",
  code:`def has_dup(nums):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] == nums[j]:
                return True
    return False`,
  time:"O(n^2)", space:"O(1)", why:"Two nested loops compare about n²/2 pairs, and only two counters are stored."}],
[18, "Big-O Basics", {type:"rank", p:"Rank these growth rates for large n", axis:["slowest growing","fastest growing"],
  items:["O(log n)","O(√n)","O(n)","O(n log n)","O(n^2)","O(2^n)"],
  why:"Logs grow slowest, then roots, then polynomials by degree; exponentials beat any polynomial."}],
[18, "Arrays and Hashing", {type:"blanks", p:"Finish two-sum with a hash map",
  code:`def two_sum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        if {0} in seen:
            return [seen[target - x], i]
        seen[{1}] = i`,
  blanks:[["target - x","x","target"],["x","i","target - x"]],
  why:"For each x, look up the partner it needs (target − x) among earlier values, then store x → its index."}],
[18, "Arrays and Hashing", {type:"compare", p:"Both count how many of `queries` appear in `data`. With 10⁵ of each, which is faster?",
  a:{label:"List lookups", code:`hits = 0
for q in queries:
    if q in data:   # a list
        hits += 1`},
  b:{label:"Set lookups", code:`lookup = set(data)
hits = 0
for q in queries:
    if q in lookup:
        hits += 1`},
  answer:"b", reason:{opts:["`in` on a set is O(1) on average; on a list it scans, O(n)","Sets keep items sorted, so they can binary search","Building a set is free"]},
  why:"A is O(n·m), about 10¹⁰ comparisons. B is O(n + m): one pass to build the set, then constant-time lookups."}],
[18, "Two Pointers", {type:"bug", p:"This palindrome check crashes with IndexError. Tap the bug.",
  code:`def is_palindrome(s):
    l, r = 0, len(s)
    while l < r:
        if s[l] != s[r]:
            return False
        l += 1
        r -= 1
    return True`,
  line:2, fix:{opts:["l, r = 0, len(s) - 1","while l <= r:","r -= 2"]},
  why:"The last valid index is len(s) − 1, so r must start there."}],
[18, "Two Pointers", {type:"bigo", p:"Two pointers on a sorted array: time and extra space?",
  code:`def pair_sum(nums, target):     # nums is sorted
    l, r = 0, len(nums) - 1
    while l < r:
        s = nums[l] + nums[r]
        if s == target:
            return [l, r]
        if s < target:
            l += 1
        else:
            r -= 1`,
  time:"O(n)", space:"O(1)", why:"Each step moves one pointer inward, so there are at most n steps, and only two indexes are stored."}],
[18, "Sliding Window", {type:"bug", p:"This returns 2 for \"abcabcbb\" instead of 3. Tap the bug.",
  code:`def longest(s):
    seen, l, best = set(), 0, 0
    for r, ch in enumerate(s):
        while ch in seen:
            seen.remove(s[l])
            l += 1
        seen.add(ch)
        best = max(best, r - l)
    return best`,
  line:8, fix:{opts:["best = max(best, r - l + 1)","best = max(best, r + l)","best = max(best, len(seen) - 1)"]},
  why:"A window from l to r inclusive holds r − l + 1 characters."}],
[18, "Sliding Window", {type:"type", norm:"code", p:"Fixed window of size k: what replaces ___ to slide the window one step?",
  code:`window = sum(nums[:k])
best = window
for r in range(k, len(nums)):
    window += ___
    best = max(best, window)`,
  answers:["nums[r] - nums[r-k]","nums[r]-nums[r - k]","-nums[r-k] + nums[r]","-nums[r-k]+nums[r]"],
  why:"Add the item entering on the right and subtract the one leaving on the left, which is k places back."}],
[18, "Stacks and Monotonic Stacks", {type:"output", p:"What does this print?",
  code:`stack = []
for c in "(()":
    if c == "(":
        stack.append(c)
    else:
        stack.pop()
print(len(stack))`,
  answer:"1", why:"Two pushes and one pop leave one unmatched \"(\", so the brackets aren't balanced."}],
[18, "Stacks and Monotonic Stacks", {type:"bigo", p:"Next greater element with a monotonic stack: time and extra space?",
  code:`def next_greater(nums):
    res, stack = [-1] * len(nums), []
    for i, x in enumerate(nums):
        while stack and nums[stack[-1]] < x:
            res[stack.pop()] = x
        stack.append(i)
    return res`,
  time:"O(n)", space:"O(n)", why:"The inner while looks nested, but each index is pushed once and popped at most once: O(n) in total. The stack can hold n indexes."}],

/* ---------------- Search and Linked Structures (unit 19) ---------------- */
[19, "Binary Search", {type:"bug", p:"This \"first index where ok is true\" search loops forever on some inputs. Tap the bug.",
  code:`def first_true(lo, hi, ok):
    while lo < hi:
        mid = (lo + hi) // 2
        if ok(mid):
            hi = mid
        else:
            lo = mid
    return lo`,
  line:7, fix:{opts:["lo = mid + 1","hi = mid - 1","mid = lo + hi"]},
  why:"When hi = lo + 1, mid equals lo, so `lo = mid` never moves. mid is known to be false, so skip it: lo = mid + 1."}],
[19, "Binary Search", {type:"num", p:"About how many halvings does binary search need, at most, for a sorted list of 1,000,000 items?",
  answer:20, tol:0, why:"2²⁰ ≈ 1.05 million, so 20 halvings shrink a million candidates to one: log₂(10⁶) ≈ 19.9, rounded up."}],
[19, "Linked Lists and Fast/Slow Pointers", {type:"type", norm:"code", p:"Find the middle node: how far does `fast` move each step?",
  code:`slow, fast = head, head
while fast and fast.next:
    slow = slow.next
    fast = ___
return slow`,
  answers:["fast.next.next"], why:"fast moves two nodes per step and slow one, so slow is halfway when fast reaches the end."}],
[19, "Trees with DFS", {type:"bug", p:"This gives every tree a depth one too large. Tap the bug.",
  code:`def depth(node):
    if node is None:
        return 1
    return 1 + max(depth(node.left), depth(node.right))`,
  line:3, fix:{opts:["return 0","return -1","return None"]},
  why:"An empty tree has depth 0. Each real node then adds exactly 1."}],
[19, "Trees with DFS", {type:"bigo", p:"Recursive DFS over a binary tree with n nodes and height h: time and extra space?",
  ladder:["O(1)","O(log n)","O(h)","O(n)","O(n log n)"], time:"O(n)", space:"O(h)",
  code:`def total(node):
    if node is None:
        return 0
    return node.val + total(node.left) + total(node.right)`,
  why:"Every node is visited once. The call stack holds one frame per level on the current path, so h deep: log n if balanced, n if it's a chain."}],
[19, "Trees with BFS", {type:"output", p:"What does this print?",
  code:`from collections import deque
tree = {1: [2, 3], 2: [4], 3: [5, 6], 4: [], 5: [], 6: []}
q, order = deque([1]), []
while q:
    node = q.popleft()
    order.append(node)
    q.extend(tree[node])
print(order)`,
  answer:"[1, 2, 3, 4, 5, 6]", why:"A queue visits nodes level by level: the root, then its children, then their children, left to right."}],
[19, "Heaps and Top-K", {type:"blanks", p:"Keep the k largest numbers with a min-heap, then return them largest first",
  code:`import heapq
def top_k(nums, k):
    heap = []
    for x in nums:
        heapq.heappush(heap, x)
        if len(heap) > k:
            heapq.{0}(heap)
    return {1}`,
  blanks:[["heappop","heappush","heapify"],["sorted(heap, reverse=True)","nums[:k]","heap[0]"]],
  why:"Popping the min whenever the heap grows past k keeps the k largest. heap[0] alone is only the k-th largest."}],
[19, "Heaps and Top-K", {type:"compare", p:"Top 10 scores from a stream of 10⁹ events that doesn't fit in memory: which works?",
  a:{label:"Sort everything", code:`top = sorted(stream, reverse=True)[:10]`},
  b:{label:"Size-10 min-heap", code:`heap = []
for x in stream:
    heapq.heappush(heap, x)
    if len(heap) > 10:
        heapq.heappop(heap)`},
  answer:"b", reason:{opts:["It keeps only 10 items in memory and costs O(n log 10)","Sorting can't handle duplicates","Heaps return results already sorted"]},
  why:"Sorting needs every item in memory and O(n log n) time. The heap streams through with O(k) memory."}],

/* ---------------- Graphs and Backtracking (unit 20) ---------------- */
[20, "Graph BFS and DFS", {type:"bug", p:"On a graph with a cycle this BFS never finishes. Tap the line to fix.",
  code:`def bfs(graph, start):
    seen = {start}
    q = deque([start])
    order = []
    while q:
        node = q.popleft()
        order.append(node)
        for nb in graph[node]:
            if nb not in seen:
                q.append(nb)
    return order`,
  line:10, fix:{opts:["seen.add(nb); q.append(nb)","q.appendleft(nb)","order.append(nb)"]},
  why:"Nothing new is ever added to `seen`, so nodes in a cycle are queued again and again. Mark a node as seen when you enqueue it."}],
[20, "Graph BFS and DFS", {type:"bigo", p:"BFS over a graph with V vertices and E edges (adjacency lists): time and extra space?",
  ladder:["O(V)","O(E)","O(V + E)","O(V · E)","O(V^2)"], time:"O(V + E)", space:"O(V)",
  why:"Each vertex is dequeued once and each adjacency list is scanned once. The queue and the seen set hold at most V vertices."}],
[20, "Topological Sort", {type:"type", norm:"code", p:"Kahn's algorithm: when is a neighbour ready to be queued?",
  code:`for nb in graph[node]:
    indeg[nb] -= 1
    if indeg[nb] == ___:
        q.append(nb)`,
  answers:["0"], why:"A node is ready once all of its prerequisites have been output, which is when its in-degree drops to 0."}],
[20, "Topological Sort", {type:"output", p:"What does this print?",
  code:`from collections import deque
graph = {"a": ["b", "c"], "b": ["d"], "c": ["d"], "d": []}
indeg = {"a": 0, "b": 1, "c": 1, "d": 2}
q, order = deque(["a"]), []
while q:
    n = q.popleft()
    order.append(n)
    for nb in graph[n]:
        indeg[nb] -= 1
        if indeg[nb] == 0:
            q.append(nb)
print("".join(order))`,
  answer:"abcd", why:"a goes first; b and c each lose their only prerequisite; d waits until both b and c are done."}],
[20, "Union-Find", {type:"blanks", p:"Finish find (with path halving) and union",
  code:`parent = list(range(n))
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = {0}
    return x
def union(a, b):
    ra, rb = find(a), find(b)
    if ra != rb:
        parent[{1}] = rb`,
  blanks:[["parent[x]","x + 1","parent[a]"],["ra","a","rb"]],
  why:"find climbs parent links to the root. union must link one ROOT under the other; linking `a` itself would detach it from its own tree."}],
[20, "Backtracking", {type:"bigo", p:"Generating all subsets of n items (copying each one into the result): time?",
  ladder:["O(n)","O(n^2)","O(2^n)","O(n · 2^n)","O(n!)"], time:"O(n · 2^n)",
  code:`def subsets(nums):
    res, path = [], []
    def go(i):
        if i == len(nums):
            res.append(path[:])
            return
        path.append(nums[i]); go(i + 1); path.pop()
        go(i + 1)
    go(0)
    return res`,
  why:"There are 2ⁿ subsets and copying each takes up to n steps."}],
[20, "Backtracking", {type:"output", p:"What does this print?",
  code:`res, path = [], []
def go(i, nums):
    if i == len(nums):
        res.append("".join(path))
        return
    path.append(nums[i]); go(i + 1, nums); path.pop()
    go(i + 1, nums)
go(0, "ab")
print(res)`,
  answer:"['ab', 'a', 'b', '']", why:"At each item the code first includes it, then excludes it, so \"take everything\" comes first and the empty subset last."}],
[20, "Tries", {type:"bigo", p:"Looking up a word of length L in a trie that holds n words: time?",
  ladder:["O(1)","O(L)","O(log n)","O(n)","O(n · L)"], time:"O(L)",
  why:"You follow one child link per character, however many words are stored."}],

/* ---------------- DP, Greedy and Intervals (unit 21) ---------------- */
[21, "1-D Dynamic Programming", {type:"type", norm:"code", p:"House robber: complete the recurrence (no two adjacent houses)",
  code:`# dp[i] = best total using houses 0..i
dp[0] = nums[0]
dp[1] = max(nums[0], nums[1])
for i in range(2, len(nums)):
    dp[i] = ___`,
  answers:["max(dp[i-1], dp[i-2] + nums[i])","max(dp[i-2] + nums[i], dp[i-1])","max(dp[i-1], nums[i] + dp[i-2])","max(nums[i] + dp[i-2], dp[i-1])"],
  why:"Either skip house i (keep dp[i−1]) or rob it, which rules out house i−1 (dp[i−2] + nums[i])."}],
[21, "1-D Dynamic Programming", {type:"compare", p:"Which computes fib(50) in well under a second?",
  a:{label:"Plain recursion", code:`def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)`},
  b:{label:"Memoised", code:`from functools import cache

@cache
def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)`},
  answer:"b", reason:{opts:["Each fib(k) is computed once, so it's O(n) instead of exponential","The decorator runs it on several cores","Recursion is always slower than loops"]},
  why:"A recomputes the same values exponentially often (about 1.6ⁿ calls). B caches each result: 51 distinct calls."}],
[21, "2-D Dynamic Programming", {type:"blanks", p:"Finish the longest-common-subsequence table",
  code:`for i in range(1, m + 1):
    for j in range(1, n + 1):
        if a[i-1] == b[j-1]:
            dp[i][j] = {0}
        else:
            dp[i][j] = max({1})`,
  blanks:[["dp[i-1][j-1] + 1","dp[i-1][j] + 1","dp[i][j-1]"],["dp[i-1][j], dp[i][j-1]","dp[i-1][j-1], dp[i][j]","dp[i][j-1], dp[i][j-1] + 1"]],
  why:"A match extends the LCS of both prefixes by one. Otherwise drop the last character of a or of b and keep the better."}],
[21, "2-D Dynamic Programming", {type:"bigo", p:"The LCS table for strings of length m and n: time and space?",
  ladder:["O(m + n)","O(min(m, n))","O(m · n)","O(m^2 · n)","O(2^(m+n))"], time:"O(m · n)", space:"O(m · n)",
  why:"There are (m+1)(n+1) cells and each takes O(1). Keeping only the previous row would cut space to O(min(m, n))."}],
[21, "Intervals", {type:"type", norm:"code", p:"Merging intervals starts by sorting them by start. Complete the key.",
  code:`intervals.sort(key=___)`,
  answers:["lambda x: x[0]","lambda iv: iv[0]","lambda i: i[0]","lambda a: a[0]","lambda p: p[0]","itemgetter(0)","operator.itemgetter(0)"],
  why:"Sorted by start, any interval that overlaps the current one comes right after it, so one pass can merge."}],
[21, "Intervals", {type:"output", p:"What does this print?",
  code:`intervals = [[1, 3], [8, 10], [2, 6]]
intervals.sort()
merged = [intervals[0]]
for s, e in intervals[1:]:
    if s <= merged[-1][1]:
        merged[-1][1] = max(merged[-1][1], e)
    else:
        merged.append([s, e])
print(merged)`,
  answer:"[[1, 6], [8, 10]]", why:"After sorting, [2, 6] overlaps [1, 3] and they merge to [1, 6]; [8, 10] starts after 6, so it stays separate."}],
[21, "Greedy", {type:"bigo", p:"Interval scheduling: sort by end time, then take each interval that doesn't overlap the last one taken. Time and extra space?",
  time:"O(n log n)", space:"O(n)",
  code:`intervals.sort(key=lambda iv: iv[1])
taken, end = [], float("-inf")
for s, e in intervals:
    if s >= end:
        taken.append((s, e))
        end = e`,
  why:"The sort dominates at O(n log n); the greedy pass is O(n). The list of taken intervals can grow to n."}],

/* ---------------- Foundations (unit 2) ---------------- */
[2, "Supervised vs Unsupervised", {type:"bucket", p:"Supervised or unsupervised?", buckets:["Supervised","Unsupervised"],
  items:[["Predict house prices from past sales","Supervised"],["Group customers by behaviour, with no labels","Unsupervised"],
    ["Flag spam using emails people marked as spam","Supervised"],["Compress images with PCA","Unsupervised"],
    ["Find unusual transactions when nothing is labelled fraud","Unsupervised"],["Classify X-rays from labelled scans","Supervised"]],
  why:"If each training example comes with the answer you want predicted, it's supervised. With no answers, you're finding structure."}],
[2, "Train / Test Split", {type:"tf", p:"True or false?",
  cards:[["Peeking at the test set once to pick a hyperparameter is fine",false,"Any choice made with the test set leaks into it. Use a validation set."],
    ["For time series, a random shuffle before splitting leaks the future",true,"Train on the past and test on later data."],
    ["A validation set is for choosing hyperparameters",true,""],
    ["A stratified split keeps class proportions similar in each part",true,""],
    ["A bigger test set makes the model itself more accurate",false,"It only makes the estimate of accuracy more precise."]],
  why:"The test set must stay untouched until the very end, or its score stops meaning anything."}],
[2, "How We Score a Wrong Answer", {type:"num", p:"Predictions [2, 4, 6], targets [3, 4, 8]. What is the mean squared error?",
  answer:5/3, tol:0.01, why:"Errors are −1, 0 and −2. Squared: 1, 0 and 4. Mean: 5 / 3 ≈ 1.67."}],
[2, "From Line to Probability", {type:"num", p:"The model's raw score is z = 2. What is sigmoid(z)? (2 decimal places)",
  answer:0.8808, tol:0.005, why:"σ(2) = 1 / (1 + e⁻²) = 1 / (1 + 0.135) ≈ 0.88."}],
[2, "Gradient Descent", {type:"derive", p:"One gradient step on L(w) = (w − 3)², starting at w = 5 with learning rate 0.1",
  items:["L(w) = (w − 3)², w = 5, lr = 0.1","dL/dw = 2(w − 3) = 4","w ← w − lr · dL/dw","w ← 5 − 0.1 · 4 = 4.6"],
  decoys:["w ← w + lr · dL/dw = 5.4","dL/dw = (w − 3) = 2"],
  why:"Step against the gradient: the slope at 5 is positive, so w moves left toward the minimum at 3."}],
[2, "Overfitting, Underfitting & the Bias–Variance Tradeoff", {type:"bucket", p:"Does each change mainly reduce variance or reduce bias?",
  buckets:["Reduces variance","Reduces bias"],
  items:[["Bagging many trees (random forest)","Reduces variance"],["Boosting","Reduces bias"],["Adding more training data","Reduces variance"],
    ["Allowing deeper trees","Reduces bias"],["Stronger L2 regularization","Reduces variance"],["Adding polynomial features","Reduces bias"]],
  why:"More capacity fights underfitting (bias); averaging, more data and regularization fight overfitting (variance)."}],
[2, "Evaluation Metrics", {type:"cm", p:"100 emails, 20 of them spam. The filter flags 18, and 15 of those really are spam.",
  labels:["spam","not spam"], answer:{tp:15, fp:3, fn:5, tn:77},
  then:[{metric:"precision", answer:15/18},{metric:"recall", answer:0.75}],
  why:"TP = 15 flagged spam, FP = 3 flagged but fine, FN = 20 − 15 missed spam, TN = the other 77. Precision 15/18 ≈ 0.83, recall 15/20 = 0.75."}],

/* ---------------- Math Primer (unit 3) ---------------- */
[3, "Vectors & Dot Product", {type:"num", p:"What is [1, 2, 3] · [4, −1, 2]?", answer:8, tol:0,
  why:"Multiply matching entries and add: 4 − 2 + 6 = 8."}],
[3, "Matrices & Shapes", {type:"dims", p:"A is (3, 4) and B is (4, 2). What shape is A @ B?",
  answer:["3","2"], chips:["2","3","4","8","12"],
  why:"The inner sizes (4 and 4) must match and disappear; the outer sizes remain: (3, 2)."}],
[3, "Matrices & Shapes", {type:"match", mono:true, p:"With `x = np.zeros((2, 3))`, match each expression to its shape",
  pairs:[["x.T.shape","(3, 2)"],["x.sum(axis=0).shape","(3,)"],["x[None].shape","(1, 2, 3)"],["x.reshape(-1).shape","(6,)"]],
  why:"Summing over an axis removes it, None adds a size-1 axis, and reshape(-1) flattens everything into one axis."}],
[3, "Derivative as Slope", {type:"num", p:"f(x) = x³. What is f′(2)?", answer:12, tol:0,
  why:"f′(x) = 3x², so f′(2) = 3 · 4 = 12."}],
[3, "The Chain Rule", {type:"derive", p:"Find dy/dx at x = 1 for y = (3x + 1)²",
  items:["Let u = 3x + 1, so y = u²","dy/du = 2u","du/dx = 3","dy/dx = 2u · 3 = 6(3x + 1)","At x = 1: 6 · 4 = 24"],
  decoys:["dy/dx = 2(3x + 1)","du/dx = 3x"],
  why:"The chain rule multiplies the outer derivative (2u) by the inner one (3). Forgetting the inner factor is the classic slip."}],
[3, "Bayes’ Rule", {type:"derive", p:"1% of people have a disease. The test catches 90% of cases and has a 5% false positive rate. Find P(disease | positive).",
  items:["P(D) = 0.01, P(+|D) = 0.9, P(+|not D) = 0.05","P(+) = 0.9 · 0.01 + 0.05 · 0.99 = 0.0585","P(D|+) = P(+|D) · P(D) / P(+)","P(D|+) = 0.009 / 0.0585 ≈ 0.15"],
  decoys:["P(D|+) = P(+|D) = 0.9","P(+) = 0.9 + 0.05 = 0.95"],
  why:"Most positives come from the 99% who are healthy, so a positive test still means only about a 15% chance of disease."}],
[3, "Mean, Variance & Standard Deviation", {type:"num", p:"Data: 2, 4, 4, 4, 5, 5, 7, 9. What is the (population) standard deviation?",
  answer:2, tol:0.01, why:"The mean is 5. Squared deviations: 9, 1, 1, 1, 0, 0, 4, 16, which sum to 32. 32 / 8 = 4, and √4 = 2."}],
[3, "Logs and Exponents", {type:"num", p:"What is log₂(8) + log₂(1/4)?", answer:1, tol:0,
  why:"log₂ 8 = 3 and log₂(1/4) = −2. Logs turn multiplying into adding: log₂(8 · 1/4) = log₂ 2 = 1."}],

/* ---------------- Architectures (unit 4) ---------------- */
[4, "Crunching the Numbers", {type:"num", p:"How many parameters does `nn.Linear(784, 128)` have, including its bias?",
  answer:100480, tol:0, why:"784 × 128 weights plus 128 biases = 100,352 + 128 = 100,480."}],
[4, "Pooling and Stride", {type:"dims", p:"x has shape (8, 16, 32, 32). What is the shape of `nn.MaxPool2d(2)(x)`?",
  answer:["8","16","16","16"], chips:["4","8","16","32","64"],
  why:"Pooling halves height and width (stride 2 by default) and leaves the batch and channels alone."}],
[4, "Dropout and Batch Norm", {type:"bug", p:"Validation loss jumps around from run to run. Tap the line that causes it.",
  code:`model.train()
for x, y in train_loader:
    opt.zero_grad()
    loss = loss_fn(model(x), y)
    loss.backward()
    opt.step()
model.train()
with torch.no_grad():
    val_loss = loss_fn(model(x_val), y_val)`,
  line:7, fix:{opts:["model.eval()","opt.zero_grad()","torch.manual_seed(0)"]},
  why:"In train mode, dropout stays on and batch norm uses batch statistics, so evaluation is noisy. Call model.eval() first."}],
[4, "CNN Shape Check", {type:"dims", p:"x has shape (1, 3, 32, 32). What is the shape of `nn.Conv2d(3, 16, kernel_size=3, padding=1)(x)`?",
  answer:["1","16","32","32"], chips:["1","3","16","30","32","34"],
  why:"16 filters give 16 channels. With padding 1, a 3×3 kernel keeps 32 × 32: (32 + 2 − 3) / 1 + 1 = 32."}],

/* ---------------- Classical ML (unit 5) ---------------- */
[5, "Customer Churn Predictor", {type:"cm", p:"2,000 customers, 400 of whom churn. The model predicts churn for 500, and 300 of those do churn.",
  labels:["churn","stays"], answer:{tp:300, fp:200, fn:100, tn:1400},
  then:[{metric:"f1", answer:600/900},{metric:"specificity", answer:0.875}],
  why:"FN = 400 − 300 = 100, FP = 500 − 300 = 200, TN = 1,600 − 200 = 1,400. F1 = 2·300 / (600 + 200 + 100) ≈ 0.67. Specificity = 1,400 / 1,600."}],
[5, "K-Nearest Neighbours", {type:"tf", p:"True or false?",
  cards:[["k-NN does almost no work at training time",true,"It stores the data; the work happens at prediction."],
    ["Feature scaling usually doesn't matter for k-NN",false,"Distances are dominated by features with big ranges."],
    ["k = 1 tends to overfit",true,"Every noisy point gets its own little region."],
    ["Prediction cost grows with the size of the training set",true,"A brute-force search compares against every stored point."],
    ["k-NN works best with thousands of features",false,"In high dimensions, distances all look alike (the curse of dimensionality)."]],
  why:"k-NN is simple but leans entirely on a meaningful distance."}],

/* ---------------- RNNs (unit 6) ---------------- */
[6, "Vanishing and Exploding Gradients", {type:"num", p:"A gradient is multiplied by 0.9 at each of 50 time steps. Roughly what fraction survives? (3 decimal places)",
  answer:Math.pow(0.9, 50), tol:0.001, why:"0.9⁵⁰ ≈ 0.005, so the early steps get almost no learning signal. That's the vanishing gradient."}],
[6, "LSTMs and GRUs", {type:"bucket", p:"LSTM or GRU?", buckets:["LSTM","GRU"],
  items:[["Has a separate cell state","LSTM"],["Merges forget and input into one update gate","GRU"],["Three gates: forget, input, output","LSTM"],["Fewer parameters for the same hidden size","GRU"]],
  why:"A GRU is a slimmer LSTM: no separate cell state and two gates instead of three."}],

/* ---------------- Transformers & LLMs (unit 7) ---------------- */
[7, "Attention Scores & Softmax", {type:"dims", p:"Q and K both have shape (B, h, n, d). What is the shape of `Q @ K.transpose(-2, -1)`?",
  answer:["B","h","n","n"], chips:["B","h","n","d"],
  why:"For each batch and head, every one of the n queries scores every one of the n keys: an n × n grid."}],
[7, "Multi-Head Attention", {type:"num", p:"d_model is 768 with 12 heads. What is each head's dimension?", answer:64, tol:0,
  why:"The model dimension is split evenly across heads: 768 / 12 = 64."}],
[7, "Decoding: Temperature, Top-p & the KV Cache", {type:"tf", p:"True or false?",
  cards:[["Raising the temperature flattens the token distribution",true,"Logits are divided by T before the softmax."],
    ["Top-p = 0.9 keeps 90% of the vocabulary",false,"It keeps the smallest set of top tokens whose probabilities add up to 0.9."],
    ["The KV cache stores past keys and values so they aren't recomputed",true,""],
    ["The KV cache speeds up the very first token",false,"Prefill fills the cache; it speeds up the tokens after that."],
    ["Temperature near 0 approaches greedy decoding",true,"The top token's probability goes to 1."]],
  why:"Sampling settings reshape one distribution; the KV cache is a separate speed trick."}],

/* ---------------- Responsible ML, MLOps, Generative (units 8-10) ---------------- */
[8, "Fairness and Trade-offs", {type:"cm", p:"A loan model, group A only: 200 applicants, 100 would repay. It approves 90, and 80 of those repay. (Positive = would repay.)",
  labels:["repays","defaults"], answer:{tp:80, fp:10, fn:20, tn:90},
  then:[{metric:"recall", answer:0.8},{metric:"fpr", answer:0.1}],
  why:"Equal opportunity compares recall (true positive rate) across groups; equalized odds also compares the false positive rate."}],
[9, "Reproducibility and Seeds", {type:"tf", p:"True or false?",
  cards:[["Setting a seed makes GPU training bit-for-bit reproducible by default",false,"Some CUDA kernels are nondeterministic unless you enable deterministic algorithms."],
    ["Pinning library versions helps reproduce a run",true,""],
    ["Recording which data version you trained on matters as much as the code version",true,""],
    ["The same seed with a different batch size gives the same model",false,"Batches and update counts change, so training follows a different path."],
    ["Logging hyperparameters with each run makes results traceable",true,""]],
  why:"Reproducibility needs the code, data, environment, settings and seed together."}],
[9, "Serving and Latency", {type:"rank", p:"Rank these by typical latency for one prediction", axis:["fastest","slowest"],
  items:["Look up a precomputed score in an in-process cache","Fetch a precomputed score from Redis in the same region","Run a small model on a CPU","Call a large LLM for a 500-token answer"],
  why:"In memory is nanoseconds, a network hop is about a millisecond, a small model is milliseconds, and generating 500 tokens takes seconds."}],
[10, "Generative vs Discriminative", {type:"bucket", p:"Generative or discriminative?", buckets:["Generative","Discriminative"],
  items:[["Naive Bayes","Generative"],["Logistic regression","Discriminative"],["A diffusion model","Generative"],["An SVM","Discriminative"],["A GAN's generator","Generative"]],
  why:"Generative models learn how the data is produced (p(x, y) or p(x)); discriminative models learn the boundary p(y | x)."}],

/* ---------------- RAG, Agents, RL, Fine-tuning, HF (units 11-15) ---------------- */
[11, "Retrieval Strategies", {type:"compare", p:"Users search docs for exact error codes like \"ERR_4031\". Which retrieval setup?",
  a:{label:"Dense only", text:"Embed the query and return the nearest chunks by cosine similarity."},
  b:{label:"Hybrid", text:"Run BM25 keyword search and dense search, then merge the two lists with reciprocal rank fusion."},
  answer:"b", reason:{opts:["Keyword search matches rare exact tokens that embeddings blur together","Hybrid search needs no index","Dense search can't use metadata"]},
  why:"Embeddings capture meaning but smudge exact strings like IDs and codes. BM25 nails them; fusing both covers both kinds of query."}],
[12, "Function Calling", {type:"tf", p:"True or false?",
  cards:[["The model runs the tool itself",false,"It only emits a call; your code runs it and returns the result."],
    ["Tool descriptions are part of the prompt and cost tokens",true,""],
    ["A JSON schema for the arguments helps the model produce valid calls",true,""],
    ["Tool arguments from the model can be trusted without validation",false,"Validate them like any user input."],
    ["The tool's result usually goes back to the model as a new message",true,""]],
  why:"Function calling is a contract: the model proposes, your code checks and executes."}],
[13, "Explore vs Exploit & Q-Learning", {type:"tf", p:"True or false?",
  cards:[["ε-greedy with ε = 0.1 explores on about 10% of steps",true,""],
    ["Q-learning is on-policy",false,"It learns the greedy policy while acting ε-greedily, which makes it off-policy."],
    ["Q(s, a) is the expected return after taking a in s and then following the policy",true,""],
    ["With γ = 0 the agent only cares about the immediate reward",true,""],
    ["Always exploiting from the start is guaranteed to find the best action",false,"It can lock onto the first decent action it tries."]],
  why:"Exploration buys information; Q-values summarise what that information says."}],
[14, "LoRA Intuition", {type:"num", p:"LoRA with rank r = 8 on one 4096 × 4096 weight matrix: how many trainable parameters (A and B)?",
  answer:65536, tol:0, why:"A is 4096 × 8 and B is 8 × 4096: 2 × 4096 × 8 = 65,536, versus 16.8 million for the full matrix (0.4%)."}],
[15, "Loading and Running Models", {type:"type", norm:"code", p:"Complete the call that loads the model weights",
  code:`from transformers import AutoTokenizer, AutoModelForCausalLM
tok = AutoTokenizer.from_pretrained(name)
model = AutoModelForCausalLM.___(name)`,
  answers:["from_pretrained"], why:"Every Auto class loads a checkpoint by name or path with `from_pretrained`."}],

/* ---------------- System Design (unit 16) ---------------- */
[16, "CDNs", {type:"est", p:"1 million people watch a live stream at 5 Mbps each. Total egress bandwidth?",
  answer:5, unit:"Tbps", min:0.01, max:1000,
  why:"10⁶ × 5 Mbps = 5 × 10⁶ Mbps = 5 Tbps. That's why live video is served from CDN edges, not one origin."}],
[16, "CAP Theorem", {type:"bucket", p:"Which need strong consistency, and where is eventual consistency fine?",
  buckets:["Strong","Eventual is fine"],
  items:[["A bank balance during a withdrawal","Strong"],["The like count on a post","Eventual is fine"],["Booking the last seat on a flight","Strong"],
    ["A video's view count","Eventual is fine"],["Making sure a new username is unique","Strong"],["A friend's new profile photo","Eventual is fine"]],
  why:"Ask what a stale or conflicting read costs. Money, inventory and uniqueness break; counters and profiles catch up harmlessly."}],
[16, "CAP Theorem", {type:"tf", p:"True or false?",
  cards:[["CAP lets you pick any two of consistency, availability and partition tolerance",false,"Partitions happen anyway; the real choice is C or A while one lasts."],
    ["During a partition, a CP system may refuse some requests",true,""],
    ["An AP system can return stale data",true,""],
    ["With no partition, a system can be both consistent and available",true,"PACELC adds the normal-time trade-off: latency vs consistency."],
    ["Eventual consistency means replicas never agree",false,"They converge once writes stop."]],
  why:"CAP is about behaviour during a network partition, not a menu of any two."}],
[16, "Back-of-Envelope Estimates", {type:"est", p:"1 billion requests a day. Average requests per second?",
  answer:1e9 / 86400, unit:"QPS", min:10, max:1e7,
  why:"A day has 86,400 s ≈ 10⁵, so 10⁹ / 10⁵ ≈ 10⁴: about 11,600 QPS on average (peaks are often 2-3× that)."}],
[16, "Design a URL Shortener", {type:"est", p:"100 million new short links a month, 500 bytes each, kept for 5 years. Total storage?",
  answer:3, unit:"TB", min:0.01, max:1000,
  why:"100M × 12 × 5 = 6 billion links × 500 B = 3 × 10¹² B = 3 TB. It fits on a few machines; reads, not storage, drive the design."}],
[16, "Message Queues", {type:"num", p:"A queue receives 1,200 messages per second. Each consumer handles 50 per second. How many consumers keep the backlog from growing?",
  answer:24, tol:0, why:"1,200 / 50 = 24. Add headroom for spikes and retries; with fewer, the lag grows without bound."}],
[16, "Replication", {type:"num", p:"N = 3 replicas, writes wait for W = 2. What is the smallest read quorum R that always sees the latest write?",
  answer:2, tol:0, why:"You need R + W > N, so the read and write sets overlap in at least one replica: R > 3 − 2, so R = 2."}],

/* ---------------- ML System Design (unit 17) ---------------- */
[17, "Batch vs Real-Time Inference", {type:"bucket", p:"Batch (precompute) or real-time?", buckets:["Batch","Real-time"],
  items:[["Nightly \"you might like\" emails","Batch"],["Fraud check while a card payment is pending","Real-time"],["Weekly churn scores for the sales team","Batch"],
    ["Search ranking for the query just typed","Real-time"],["Monthly credit limit reviews","Batch"]],
  why:"Precompute when inputs are known ahead and a delay is fine; score online when the input only exists at request time."}],
[17, "A/B Testing Models", {type:"num", p:"Control converts 1,000 of 50,000 users. Treatment converts 1,100 of 50,000. What is the relative lift, in percent?",
  answer:10, tol:0.1, unit:"%", why:"2.0% to 2.2% is +0.2 points, which is 0.2 / 2.0 = a 10% relative lift. Whether it's significant is a separate question."}],

/* ---------------- Interview Craft & Estimation (unit 22) ---------------- */
[22, "Requirements, SLOs and the Nines", {type:"bucket", p:"URL shortener: functional or non-functional requirement?",
  buckets:["Functional","Non-functional"],
  items:[["Users can create a short link","Functional"],["Redirects take under 50 ms at p99","Non-functional"],["Links can expire on a chosen date","Functional"],
    ["99.99% availability","Non-functional"],["Owners can see click counts","Functional"],["Handles 10,000 redirects per second","Non-functional"]],
  why:"Functional says what the system does; non-functional says how well (speed, scale, availability)."}],
[22, "Requirements, SLOs and the Nines", {type:"num", p:"A 99.9% availability SLO allows how many minutes of downtime in a 30-day month?",
  answer:43.2, tol:0.5, unit:"min", why:"30 × 24 × 60 = 43,200 minutes, and 0.1% of that is 43.2. Each extra nine divides it by 10."}],
[22, "Latency Numbers Every Engineer Should Know", {type:"rank", p:"Rank by typical latency", axis:["fastest","slowest"],
  items:["L1 cache reference","Main memory reference","SSD random read","Round trip within a datacenter","Hard disk seek","Packet round trip, California to Europe"],
  why:"Roughly 1 ns, 100 ns, tens of µs, 0.5 ms, several ms and 150 ms: each step is about 10-100× the one before."}],
[22, "Latency Numbers Every Engineer Should Know", {type:"est", p:"Each call is one round trip inside a datacenter (about 0.5 ms). How many sequential calls fit in a 100 ms budget?",
  answer:200, unit:"calls", min:1, max:100000,
  why:"100 / 0.5 = 200. One cross-continent round trip (~150 ms) alone would blow the budget."}],
[22, "Estimating ML and LLM Workloads", {type:"est", p:"10 million LLM requests a day, each generating 1,000 output tokens. Average output tokens per second?",
  answer:1e10 / 86400, unit:"tokens/s", min:100, max:1e9,
  why:"10⁷ × 10³ = 10¹⁰ tokens a day, divided by 86,400 s ≈ 116,000 tokens/s on average."}],
[22, "Estimating ML and LLM Workloads", {type:"num", p:"Peak load is 2,000 requests/s, one GPU sustains 50 requests/s within the latency target, and you want 25% headroom. How many GPUs?",
  answer:50, tol:0, why:"2,000 / 50 = 40 GPUs at full load; 40 × 1.25 = 50 to keep 25% spare."}],

/* ---------------- Scaling the Request Path (unit 23) ---------------- */
[23, "Cache Write Strategies and Invalidation", {type:"compare", p:"After a profile update, which order is safer?",
  a:{label:"DB, then delete the cache key", text:"Write the new profile to the database. Once it commits, delete the cached entry so the next read reloads it."},
  b:{label:"Cache, then DB", text:"Write the new profile into the cache, then write it to the database."},
  answer:"a", reason:{opts:["If the DB write fails, B leaves the cache serving a value that was never saved","Deleting is faster than writing","B can't work with Redis"]},
  why:"The database is the source of truth. Update it first, then invalidate; the next read repopulates the cache from committed data."}],
[23, "Timeouts, Retries and Circuit Breakers", {type:"compare", p:"A downstream service is overloaded and timing out. Which client retry policy helps it recover?",
  a:{label:"Retry immediately", text:"Retry up to 5 times with no delay."},
  b:{label:"Backoff with jitter", text:"Retry up to 3 times, waiting 100 ms, 200 ms, then 400 ms, each with random jitter."},
  answer:"b", reason:{opts:["Spreading retries out avoids a synchronized retry storm on a struggling service","More retries always succeed sooner","Jitter makes requests smaller"]},
  why:"Immediate retries multiply load exactly when the service is weakest. Backoff and jitter spread it out."}],
[23, "Timeouts, Retries and Circuit Breakers", {type:"num", p:"Three services call each other in a chain, and each layer retries up to 3 times (4 attempts in total). Worst case, how many requests can reach the bottom service from one user request?",
  answer:64, tol:0, why:"4 × 4 × 4 = 64. Retries multiply across layers; retry at one layer only, or use a retry budget."}],

/* ---------------- Storage, Partitioning & Consistency (unit 24) ---------------- */
[24, "Consistency Models and PACELC", {type:"rank", p:"Rank these consistency models", axis:["strongest","weakest"],
  items:["Linearizable","Sequential","Causal","Eventual"],
  why:"Linearizable respects real time; sequential keeps one agreed order; causal only orders related writes; eventual only promises convergence."}],
[24, "Object Storage and Blob Data", {type:"est", p:"A photo app stores 50 million new photos a day at 2 MB each. Roughly how much storage is added per year?",
  answer:36.5, unit:"PB", min:0.01, max:10000,
  why:"50M × 2 MB = 100 TB a day; × 365 ≈ 36.5 PB a year, before replication. That's object storage territory."}],
[24, "Object Storage and Blob Data", {type:"rank", p:"Rank by cost per GB-month", axis:["cheapest","most expensive"],
  items:["Archive object storage (e.g. S3 Glacier Deep Archive)","Standard object storage (e.g. S3 Standard)","Network SSD block storage (e.g. EBS gp3)","RAM in a cache cluster"],
  why:"Roughly $0.001, $0.02, $0.08 and several dollars per GB-month. Faster access costs more."}],

/* ---------------- Async Messaging (unit 25) ---------------- */
[25, "Delivery Semantics and Idempotency", {type:"compare", p:"The queue delivers each payment message at least once. Which consumer is correct?",
  a:{label:"Apply directly", code:`def handle(msg):
    add_to_balance(msg.account, msg.amount)`},
  b:{label:"Idempotency key", code:`def handle(msg):
    if insert_if_new(msg.payment_id):   # unique key
        add_to_balance(msg.account, msg.amount)`},
  answer:"b", reason:{opts:["Redelivered duplicates are skipped, so each payment counts once","It makes the queue deliver exactly once","It's faster because it skips the database"]},
  why:"At-least-once delivery means duplicates will arrive. An idempotency key turns \"at least once\" into \"effectively once\". In real code, record the key and update the balance in the same transaction."}],
[25, "Fan-out on Write vs Fan-out on Read", {type:"compare", p:"A celebrity with 50 million followers posts. How should their post reach feeds?",
  a:{label:"Fan-out on write", text:"Immediately push the post id into all 50 million followers' feed caches."},
  b:{label:"Fan-out on read", text:"Store it once; when a follower opens their feed, merge in recent posts from the celebrities they follow."},
  answer:"b", reason:{opts:["One post would cost 50 million writes; reading a few celebrity timelines is cheap","Fan-out on read is always faster for everyone","Followers can't see pushed posts"]},
  why:"Most systems are hybrid: push for normal accounts, pull for the few accounts with huge followings."}],
[25, "Kafka: Logs, Partitions, Consumer Groups", {type:"tf", p:"True or false?",
  cards:[["Within one partition, Kafka keeps messages in order",true,""],
    ["A topic with 6 partitions can use up to 6 active consumers in one group",true,"Extra consumers in the group sit idle."],
    ["Kafka deletes a message as soon as one consumer reads it",false,"It's a log kept for a retention period; consumers track their own offsets."],
    ["Messages with the same key go to the same partition",true,""],
    ["Kafka guarantees ordering across all partitions of a topic",false,"Only within a partition."]],
  why:"Partitions are the unit of order and of parallelism."}],

/* ---------------- ML Design Framework (unit 26) ---------------- */
[26, "Choosing Offline Metrics", {type:"bucket", p:"Which mistake costs more: should the metric favour recall or precision?",
  buckets:["Favour recall","Favour precision"],
  items:[["Cancer screening that sends positives for a follow-up test","Favour recall"],["Auto-banning accounts with no human review","Favour precision"],
    ["Flagging card payments for a quick SMS confirmation","Favour recall"],["Deleting emails as spam without a spam folder","Favour precision"],
    ["Surfacing possible safety incidents for an analyst queue","Favour recall"],["Auto-approving refunds with no checks","Favour precision"]],
  why:"Cheap follow-up on a positive: catch everything (recall). An irreversible action on a positive: be sure first (precision)."}],
[26, "Choosing Offline Metrics", {type:"cm", p:"Ticket triage: 1,000 tickets, 100 truly urgent. The model marks 120 as urgent, and 90 of those are.",
  labels:["urgent","not urgent"], answer:{tp:90, fp:30, fn:10, tn:870},
  then:[{metric:"precision", answer:0.75},{metric:"recall", answer:0.9}],
  why:"FP = 120 − 90 = 30, FN = 100 − 90 = 10, TN = 900 − 30 = 870."}],
[26, "Splits, Sampling and Leakage", {type:"bucket", p:"Leak or safe?", buckets:["Leak","Safe"],
  items:[["Random split of user sessions when the same user appears in train and test","Leak"],["Splitting by time: train on Jan-Mar, test on April","Safe"],
    ["Feature: total refunds in the 30 days after the order","Leak"],["Feature: the user's account age at prediction time","Safe"],
    ["Downsampling negatives in training only, then calibrating","Safe"]],
  why:"A leak is anything in training that won't exist, or would be different, at prediction time."}],

/* ---------------- Data & Feature Platforms (unit 27) ---------------- */
[27, "Lakes, Warehouses and Lakehouses", {type:"type", norm:"text", p:"Complete the SQL to count events per user",
  code:`SELECT user_id, COUNT(*)
FROM events
___ user_id;`,
  answers:["GROUP BY"], why:"An aggregate like COUNT(*) next to a plain column needs GROUP BY on that column."}],
[27, "Online vs Offline Stores and Log-and-Wait", {type:"bucket", p:"Online store or offline store?", buckets:["Online store","Offline store"],
  items:[["Fetch a user's features in 5 ms while scoring a request","Online store"],["Build a two-year training set with point-in-time joins","Offline store"],
    ["Backfill a new feature over historical data","Offline store"],["Serve the latest feature values by key","Online store"]],
  why:"The online store is a low-latency key-value lookup of fresh values; the offline store keeps full history for training."}],

/* ---------------- Training Pipelines (unit 28) ---------------- */
[28, "GPU Memory Math for Training", {type:"num", p:"Mixed-precision training with Adam needs about 16 bytes per parameter (weights, gradients, master copy, two moments). How many GB for a 7B-parameter model, before activations?",
  answer:112, rel:0.05, unit:"GB", why:"7 × 10⁹ × 16 B = 112 GB. That's more than one 80 GB GPU, which is why ZeRO and FSDP shard these states."}],
[28, "GPU Memory Math for Training", {type:"rank", p:"Mixed-precision Adam: rank these per-parameter memory costs", axis:["largest","smallest"],
  items:["Adam moments m and v (FP32)","FP32 master weights","BF16 gradients"],
  why:"Two FP32 moments are 8 bytes, the master weights 4 bytes, and BF16 gradients 2 bytes per parameter."}],
[28, "Data Parallelism and All-Reduce", {type:"num", p:"8 GPUs each run a micro-batch of 32 and accumulate gradients over 4 steps before updating. What is the effective batch size?",
  answer:1024, tol:0, why:"8 × 32 × 4 = 1,024 examples contribute to each optimizer step."}],

/* ---------------- Model Serving (unit 29) ---------------- */
[29, "Latency Budgets and Tail Latency", {type:"num", p:"A page fans out to 100 backends in parallel, and each is slow (above its p99) 1% of the time. What is the chance at least one is slow, in percent?",
  answer:(1 - Math.pow(0.99, 100)) * 100, tol:0.5, unit:"%",
  why:"1 − 0.99¹⁰⁰ ≈ 63%. With wide fan-out, one backend's tail becomes the page's typical latency."}],
[29, "Model Compression: Quantization, Distillation, Pruning", {type:"num", p:"A 13B-parameter model is quantized from FP16 to INT4. How many GB do the weights need now?",
  answer:6.5, rel:0.05, unit:"GB", why:"INT4 is half a byte per parameter: 13 × 10⁹ × 0.5 B = 6.5 GB, down from 26 GB in FP16."}],

/* ---------------- Monitoring (unit 30) ---------------- */
[30, "Data Drift vs Concept Drift", {type:"bucket", p:"Data drift or concept drift?", buckets:["Data drift","Concept drift"],
  items:[["A marketing push brings many users from a new country","Data drift"],["Fraudsters change tactics, so the same features mean less fraud","Concept drift"],
    ["A camera upgrade makes all images brighter","Data drift"],["After a recession, the same browsing now predicts different purchases","Concept drift"],
    ["Inflation changes how price-sensitive customers are","Concept drift"]],
  why:"Data drift: the inputs p(x) change. Concept drift: the relationship p(y | x) changes, so the same inputs now mean something else."}],
[30, "Feedback Loops and Position Bias", {type:"tf", p:"True or false?",
  cards:[["Items shown at the top get more clicks partly because of their position",true,""],
    ["Training only on clicks from your own ranker can reinforce its past choices",true,"That's the feedback loop."],
    ["A little randomised exploration helps you collect less biased data",true,""],
    ["Click-through rate on the top slot is an unbiased estimate of relevance",false,"Position inflates it."],
    ["Feedback loops only affect recommender systems",false,"Fraud, credit and policing models shape their own future labels too."]],
  why:"A model that decides what gets seen also decides what it learns from next."}],

/* ---------------- Recsys & Ads (unit 31) ---------------- */
[31, "Two-Tower Retrieval and Similar Items", {type:"dims", p:"User tower outputs U with shape (B, 128); item embeddings V have shape (N, 128). What is the shape of the score matrix `U @ V.T`?",
  answer:["B","N"], chips:["B","N","128","256"],
  why:"Each of the B users gets a dot-product score against each of the N items."}],
[31, "Case: Video Recommendations", {type:"est", p:"The ranker scores 500 candidates per request at 20,000 requests per second. Model scores per second?",
  answer:1e7, unit:"scores/s", min:1000, max:1e10,
  why:"500 × 20,000 = 10⁷ scores per second, which is why the heavy ranker only sees a short candidate list."}],
[31, "Value Models and Re-ranking", {type:"rank", p:"Rank the stages of a recommender funnel by how many items each handles", axis:["most items","fewest items"],
  items:["Full catalogue","Candidate retrieval","Light ranker","Heavy ranker","Final re-ranked slate"],
  why:"Each stage is more expensive per item, so each sees fewer: millions, then thousands, hundreds, tens, and a final page."}],

/* ---------------- Risk & Trust (unit 32) ---------------- */
[32, "Case: Payment Fraud Detection", {type:"cm", p:"1,000,000 payments, 1,000 of them fraud. The model blocks 2,000 payments and catches 800 frauds.",
  labels:["fraud","legit"], answer:{tp:800, fp:1200, fn:200, tn:997800},
  then:[{metric:"precision", answer:0.4},{metric:"recall", answer:0.8}],
  why:"FP = 2,000 − 800 = 1,200 good customers blocked; FN = 200 missed. Accuracy would be 99.86%, which says nothing here."}],
[32, "Choosing Thresholds by Cost", {type:"num", p:"Missing a fraud costs $500 and blocking a good payment costs $20. At what fraud probability does blocking become worth it? (Block when p × 500 > (1 − p) × 20.)",
  answer:20 / 520, tol:0.002, why:"Set p · 500 = (1 − p) · 20, so p = 20 / 520 ≈ 0.038. Cheap false alarms justify a low threshold."}],
[32, "Case: Harmful Content Moderation", {type:"cm", p:"10,000 posts, 300 harmful. The classifier removes 250 posts, and 200 of them are harmful.",
  labels:["harmful","fine"], answer:{tp:200, fp:50, fn:100, tn:9650},
  then:[{metric:"precision", answer:0.8},{metric:"recall", answer:200/300}],
  why:"FP = 50 fine posts removed; FN = 100 harmful posts left up. Raising recall would cost precision."}],

/* ---------------- RAG Systems (unit 33) ---------------- */
[33, "Chunking Strategies", {type:"num", p:"A 10,000-token document is split into 500-token chunks with 100 tokens of overlap (each chunk starts 400 tokens after the last). How many chunks?",
  answer:25, tol:0, why:"Starts at 0, 400, ..., 9,600: that's 25 starts, and the 25th chunk (9,600-10,000) reaches the end."}],
[33, "Hybrid Search and Rank Fusion", {type:"num", p:"Reciprocal rank fusion with k = 60: a document is ranked 1st by BM25 and 3rd by dense search. What is its RRF score? (4 decimal places)",
  answer:1 / 61 + 1 / 63, tol:0.0002, why:"RRF adds 1 / (k + rank) per list: 1/61 + 1/63 ≈ 0.0164 + 0.0159 = 0.0323."}],
[33, "ANN Indexes: HNSW, IVF and PQ", {type:"num", p:"Product quantization splits a 768-dimensional float32 vector into 96 sub-vectors, each stored as a 1-byte code. How many times smaller is it?",
  answer:32, tol:0, why:"768 × 4 B = 3,072 B before; 96 × 1 B = 96 B after. 3,072 / 96 = 32×."}],

/* ---------------- LLM App Quality (unit 34) ---------------- */
[34, "Guardrails: Input and Output", {type:"bucket", p:"Input guardrail or output guardrail?", buckets:["Input","Output"],
  items:[["Block requests for weapon synthesis instructions","Input"],["Remove personal data from the answer before showing it","Output"],
    ["Detect prompt-injection text in a pasted document","Input"],["Check the answer only cites retrieved sources","Output"],
    ["Cap the length of user messages","Input"],["Validate generated JSON against the schema before running a tool","Output"]],
  why:"Input checks run before the model sees the request; output checks run on what it produced, before anyone acts on it."}],
[34, "Cost and Latency Math for LLM Apps", {type:"est", p:"1 million requests a day, each with 2,000 input and 500 output tokens. Input costs $3 and output $15 per million tokens. Cost per 30-day month?",
  answer:405000, unit:"$", min:100, max:1e9,
  why:"Input: 2 × 10⁹ tokens × $3/M = $6,000 a day. Output: 5 × 10⁸ × $15/M = $7,500. $13,500 × 30 ≈ $405,000."}],
[34, "Caching: Prompt, Exact and Semantic", {type:"rank", p:"Rank by cost to answer one request", axis:["cheapest","most expensive"],
  items:["Exact-match cache hit","Small model, short prompt","Large model, short prompt","Large model with a 100,000-token prompt"],
  why:"A cache hit skips the model entirely; after that, cost scales with model size and tokens processed."}],

/* ---------------- Agents & Tool-Use (unit 35) ---------------- */
[35, "Workflows vs Agents", {type:"bucket", p:"A fixed workflow, or an agent?", buckets:["Workflow","Agent"],
  items:[["Translate each support ticket, then route it by language","Workflow"],["Research a question across unknown websites until it's answered","Agent"],
    ["Extract invoice fields into a fixed schema","Workflow"],["Fix a failing test in an unfamiliar codebase","Agent"],
    ["Summarise every call transcript nightly","Workflow"],["Plan a multi-city trip, rebooking as availability changes","Agent"]],
  why:"If you can write the steps down in advance, use a workflow. Use an agent when the next step depends on what it just found."}],
[35, "Sandboxing, Permissions and Human Approval", {type:"rank", p:"Rank these agent actions by risk", axis:["lowest risk","highest risk"],
  items:["Read a public web page","Read the user's calendar","Send an email as the user","Transfer money from the user's account"],
  why:"Risk grows with private data access and with actions that are external and irreversible. Gate the top ones behind human approval."}],
[35, "Reliability: Budgets, Retries, Checkpoints", {type:"num", p:"Each step of an agent succeeds independently with probability 0.95. What is the chance a 10-step task succeeds? (2 decimal places)",
  answer:Math.pow(0.95, 10), tol:0.01, why:"0.95¹⁰ ≈ 0.60. Errors compound, which is why long agent runs need checks, retries and checkpoints."}],

/* ---------------- LLM Serving (unit 36) ---------------- */
[36, "KV Cache Memory Math", {type:"num", p:"A model has 32 layers, 8 KV heads of dimension 128, and stores K and V in FP16. How many KiB of KV cache per token?",
  answer:128, tol:0, unit:"KiB", why:"2 (K and V) × 32 layers × 8 heads × 128 dims × 2 bytes = 131,072 B = 128 KiB per token."}],
[36, "KV Cache Memory Math", {type:"num", p:"Same model, 128 KiB per token. How many GiB for one 32,768-token sequence?",
  answer:4, tol:0.05, unit:"GiB", why:"32,768 × 128 KiB = 4,194,304 KiB = 4 GiB. Long contexts and big batches are limited by this, not by the weights."}],
[36, "Quantization for LLM Serving", {type:"rank", p:"Rank by memory per weight", axis:["most memory","least memory"],
  items:["FP32","BF16","INT8","INT4"], why:"4, 2, 1 and 0.5 bytes per parameter."}],
[36, "Capacity Planning, Autoscaling and Cost", {type:"est", p:"A GPU generates 2,500 tokens/s with batching and costs $2 an hour. Roughly what does it cost per million output tokens?",
  answer:2 / (2500 * 3600 / 1e6), unit:"$", min:0.001, max:100, within:2,
  why:"2,500 × 3,600 = 9 million tokens an hour for $2, so about $0.22 per million at full utilisation. Real utilisation is lower."}],

/* ---------------- Privacy & Responsible AI (unit 37) ---------------- */
[37, "Privacy-Preserving ML", {type:"tf", p:"True or false?",
  cards:[["Removing names is enough to anonymise a dataset",false,"Combinations like ZIP code, birth date and gender can re-identify people."],
    ["In differential privacy, a smaller ε means stronger privacy",true,""],
    ["Federated learning sends raw user data to the server",false,"It sends model updates, which can still leak, so it's often combined with DP or secure aggregation."],
    ["Adding calibrated noise is how differential privacy limits what one person changes",true,""],
    ["Models can memorise and repeat rare training examples",true,"That's why privacy reviews test for extraction."]],
  why:"Privacy is about what can be inferred, not just which columns were dropped."}],

/* ---------------- Probability & Stats deep dive (unit 38) ---------------- */
[38, "Expectation, Variance & the CLT", {type:"num", p:"One fair die roll has standard deviation ≈ 1.708. What is the standard deviation of the average of 100 rolls?",
  answer:0.1708, rel:0.03, why:"The standard error is σ / √n = 1.708 / 10 ≈ 0.171. Averages get tighter with √n, not n."}],
[38, "Maximum Likelihood", {type:"derive", p:"A coin lands heads h times and tails t times. Derive the maximum-likelihood estimate of p = P(heads).",
  items:["L(p) = pʰ (1 − p)ᵗ","log L = h log p + t log(1 − p)","d/dp: h/p − t/(1 − p) = 0","p̂ = h / (h + t)"],
  decoys:["d/dp: h/p + t/(1 − p) = 0","p̂ = t / (h + t)"],
  why:"Take the log to turn the product into a sum, set the derivative to zero, and solve: the MLE is the observed fraction of heads."}],
[38, "A/B Tests: Power & Sample Size", {type:"num", p:"Rule of thumb n ≈ 16 σ² / δ² users per group (80% power, 5% significance). For a 10% conversion rate (σ² = 0.09) and an absolute lift δ = 0.01, what is n?",
  answer:14400, rel:0.02, why:"16 × 0.09 / 0.0001 = 14,400 per group. Halving the detectable lift quadruples n."}],

/* ---------------- Backprop deep dive (unit 39) ---------------- */
[39, "Local Gradients of Common Ops", {type:"num", p:"f = x · y + z with x = 2, y = −3, z = 4. What is ∂f/∂x?",
  answer:-3, tol:0, why:"A multiply gate passes each input the OTHER input times the upstream gradient: ∂f/∂x = y = −3."}],
[39, "Gradients of a Linear Layer", {type:"type", norm:"code", p:"y = x @ W with x: (B, d_in) and W: (d_in, d_out). Given dy = ∂L/∂y, type ∂L/∂W.",
  code:`dW = ___`,
  answers:["x.T @ dy","np.dot(x.T, dy)","x.T.dot(dy)","x.transpose() @ dy","x.t() @ dy"],
  why:"dW must have W's shape (d_in, d_out): (d_in, B) @ (B, d_out). The batch dimension is summed by the product."}],
[39, "Softmax + Cross-Entropy Gradient", {type:"derive", p:"Derive ∂L/∂zᵢ for softmax followed by cross-entropy, where y is the true class",
  items:["L = −log p_y","p_i = e^{z_i} / Σ_j e^{z_j}","∂ log p_y / ∂z_i = 1[i = y] − p_i","∂L/∂z_i = p_i − 1[i = y]"],
  decoys:["∂L/∂z_i = p_i","∂L/∂z_i = −1 / p_y"],
  why:"The gradient is just predicted minus one-hot: a clean signal that's why the two are fused in practice."}],
[39, "Autograd in Practice", {type:"type", norm:"code", p:"Evaluate without building a computation graph",
  code:`with torch.___():
    preds = model(x_val)`,
  answers:["no_grad","inference_mode"], why:"Inside no_grad (or inference_mode), autograd records nothing, which saves memory and time."}],

/* ---------------- Optimizers deep dive (unit 40) ---------------- */
[40, "Momentum", {type:"num", p:"Momentum with β = 0.9 and a constant gradient. The velocity settles at how many times the gradient?",
  answer:10, tol:0, why:"v = βv + g settles where v = g / (1 − β) = 10g, so steps grow up to 10× along a consistent direction."}],
[40, "Adam Step by Step", {type:"blanks", p:"Finish the Adam update",
  code:`m = b1 * m + (1 - b1) * g
v = b2 * v + (1 - b2) * {0}
m_hat = m / (1 - b1 ** t)
v_hat = v / (1 - b2 ** t)
w -= lr * m_hat / ({1} + eps)`,
  blanks:[["g ** 2","g","abs(g)"],["np.sqrt(v_hat)","v_hat","np.sqrt(v)"]],
  why:"v tracks the squared gradient; dividing by its square root (bias-corrected) scales each parameter's step to its gradient size."}],
[40, "Learning-Rate Schedules", {type:"num", p:"Linear warmup to a peak learning rate of 3e-4 over 1,000 steps. What is the learning rate at step 250?",
  answer:7.5e-5, rel:0.01, why:"250 / 1,000 of the way: 0.25 × 3e-4 = 7.5e-5."}],

/* ---------------- Regularization deep dive (unit 41) ---------------- */
[41, "Dropout, Mechanically", {type:"tf", p:"True or false?",
  cards:[["Dropout is active at inference time",false,"model.eval() turns it off; inverted dropout already scaled activations during training."],
    ["With inverted dropout and p = 0.5, kept activations are doubled in training",true,"Scaling by 1 / (1 − p) keeps the expected activation the same."],
    ["Dropout usually raises the training loss",true,"It adds noise in training; the payoff is lower validation loss."],
    ["Dropout and batch norm behave the same in train and eval mode",false,"Both switch: dropout turns off, batch norm uses running statistics."],
    ["Each training step drops a fresh random set of units",true,""]],
  why:"Dropout trains many thinned networks at once, then uses the full one at test time."}],
[41, "Imbalanced Classes", {type:"num", p:"A dataset has 990 negatives and 10 positives. With \"balanced\" class weights (n_samples / (2 × n_class)), what weight do positives get?",
  answer:50, tol:0, why:"1,000 / (2 × 10) = 50. Each positive then counts as much as about 50 negatives (whose weight is 1,000 / 1,980 ≈ 0.505)."}],

/* ---------------- Evaluation Metrics deep dive (unit 42) ---------------- */
[42, "Thresholds Make the Confusion Matrix", {type:"cm", p:"1,000 transactions, 50 of them fraud. At this threshold the model flags 80, and 40 of those are fraud.",
  labels:["fraud","legit"], answer:{tp:40, fp:40, fn:10, tn:910},
  then:[{metric:"precision", answer:0.5},{metric:"recall", answer:0.8}],
  why:"FP = 80 − 40, FN = 50 − 40, TN = 950 − 40. Raising the threshold would cut FP but also TP."}],
[42, "Precision, Recall, F-scores", {type:"cm", p:"200 patients, 50 have the disease. 40 people test positive, and 30 of them are sick.",
  labels:["sick","healthy"], answer:{tp:30, fp:10, fn:20, tn:140},
  then:[{metric:"precision", answer:0.75},{metric:"recall", answer:0.6},{metric:"f1", answer:60/90}],
  why:"F1 = 2PR / (P + R) = 2 × 0.75 × 0.6 / 1.35 ≈ 0.67, the harmonic mean, which sits closer to the weaker of the two."}],
[42, "ROC Curves & AUC", {type:"tf", p:"True or false?",
  cards:[["AUC needs calibrated probabilities",false,"AUC depends only on how the scores rank examples."],
    ["Random scores give an AUC of about 0.5",true,""],
    ["Doubling every score leaves AUC unchanged",true,"Any increasing transform keeps the ranking."],
    ["AUC is the chance a random positive scores above a random negative",true,""],
    ["With 1% positives, AUC tells you precision at the top of the list",false,"ROC ignores class balance; look at the PR curve."]],
  why:"AUC measures ranking quality across all thresholds, nothing more."}],
[42, "PR Curves & Imbalance", {type:"cm", p:"10,000 accounts, 100 of them bots. A lazy model says \"not a bot\" for every account.",
  labels:["bot","human"], answer:{tp:0, fp:0, fn:100, tn:9900},
  then:[{metric:"accuracy", answer:0.99},{metric:"recall", answer:0}],
  why:"99% accuracy and zero bots caught. With heavy imbalance, accuracy hides failure; precision and recall don't."}],
[42, "Ranking Metrics: P@k, Recall@k, MRR", {type:"num", p:"For three queries, the first relevant result is at rank 1, rank 3 and rank 2. What is the MRR?",
  answer:(1 + 1 / 3 + 1 / 2) / 3, tol:0.01, why:"Mean of the reciprocal ranks: (1 + 0.333 + 0.5) / 3 ≈ 0.61."}],
[42, "MAP & NDCG", {type:"num", p:"Graded relevances in ranked order are 3, 2, 0. With DCG = Σ rel / log₂(rank + 1), what is the DCG? (2 decimal places)",
  answer:3 + 2 / Math.log2(3), tol:0.01, why:"3 / log₂2 + 2 / log₂3 + 0 = 3 + 1.26 = 4.26. This order is already ideal, so its NDCG would be 1."}],

/* ---------------- CNN Internals deep dive (unit 43) ---------------- */
[43, "Receptive Fields", {type:"num", p:"Three stacked 3×3 convolutions, stride 1. What is the receptive field (side length) of one output pixel?",
  answer:7, tol:0, why:"Each 3×3 layer adds 2: 3, then 5, then 7. Same view as one 7×7 kernel with fewer weights."}],
[43, "Counting Parameters & Compute", {type:"num", p:"How many parameters does `nn.Conv2d(64, 128, kernel_size=3)` have, including biases?",
  answer:73856, tol:0, why:"64 × 128 × 3 × 3 = 73,728 weights plus 128 biases = 73,856."}],
[43, "1×1 and Depthwise Convolutions", {type:"dims", p:"x is (B, 256, 14, 14). What is the shape of `nn.Conv2d(256, 64, kernel_size=1)(x)`?",
  answer:["B","64","14","14"], chips:["B","1","7","14","64","256"],
  why:"A 1×1 conv mixes channels at each pixel: 256 channels in, 64 out, and the spatial size stays 14 × 14."}],

/* ---------------- Attention deep dive (unit 44) ---------------- */
[44, "Q, K, V Projections & Shapes", {type:"dims", p:"x is (B, n, 512) and W_q is (512, 64). What is the shape of Q = x @ W_q?",
  answer:["B","n","64"], chips:["B","n","8","64","512"],
  why:"The projection maps each token's 512 features to 64; batch and sequence axes pass through."}],
[44, "Why Scale by √d_k", {type:"derive", p:"Why divide attention scores by √d_k? Build the argument.",
  items:["q and k have d_k independent entries, each with mean 0 and variance 1","Each product q_i k_i has variance 1","q · k sums d_k such terms, so Var(q · k) = d_k","Dividing by √d_k brings the variance back to 1","So the softmax stays out of its flat, saturated region"],
  decoys:["Var(q · k) = 1 whatever d_k is","Dividing by d_k brings the variance back to 1"],
  why:"Variance adds over independent terms, so the score's spread grows like √d_k. Scaling keeps gradients alive as d_k grows."}],
[44, "Causal Masking", {type:"blanks", p:"Finish causal self-attention in NumPy",
  code:`scores = q @ k.T / np.sqrt({0})
mask = np.triu(np.ones((n, n)), k=1).astype(bool)
scores[mask] = {1}
weights = softmax(scores, axis=-1)`,
  blanks:[["d_k","n","d_model * n"],["-np.inf","0","1"]],
  why:"Future positions get −∞ so softmax gives them exactly 0 weight. Setting them to 0 would still give them weight e⁰."}],
[44, "Multi-Head Attention in Shapes", {type:"dims", p:"x is (B, n, 512) with h = 8 heads. After projecting and splitting into heads (heads before tokens), what is the shape?",
  answer:["B","8","n","64"], chips:["B","n","8","64","512"],
  why:"512 / 8 = 64 per head, and heads move next to batch so each head attends over all n tokens in parallel."}],

/* ---------------- Embeddings deep dive (unit 45) ---------------- */
[45, "What Makes a Good Embedding", {type:"num", p:"What is the cosine similarity of [1, 0] and [1, 1]? (2 decimal places)",
  answer:Math.SQRT1_2, tol:0.01, why:"cos = (1·1 + 0·1) / (1 × √2) = 1/√2 ≈ 0.71, a 45° angle."}],
[45, "Negatives: In-Batch & Hard", {type:"num", p:"In-batch negatives with a batch of 256 query-document pairs: how many negatives does each query get?",
  answer:255, tol:0, why:"Every other document in the batch is a negative for this query: 256 − 1 = 255, at no extra encoding cost."}],

/* ---------------- Post-training deep dive (unit 46) ---------------- */
[46, "QLoRA & Quantized Fine-tuning", {type:"compare", p:"You have one 48 GB GPU and want to fine-tune a 70B-parameter model. Which plan can work?",
  a:{label:"Full fine-tuning", text:"Train all 70B weights with Adam in mixed precision."},
  b:{label:"QLoRA", text:"Freeze the base model in 4-bit and train small LoRA adapters."},
  answer:"b", reason:{opts:["4-bit base weights take about 35 GB and only the adapters need gradients and optimizer state","QLoRA trains faster per step than any other method","Full fine-tuning can't use mixed precision"]},
  why:"Full fine-tuning needs about 16 bytes per parameter, over 1 TB here. QLoRA keeps the frozen base small and trains a tiny fraction of parameters."}],
[46, "LoRA, Precisely", {type:"num", p:"With LoRA scaling α / r, what is the multiplier on BA when α = 16 and r = 8?",
  answer:2, tol:0, why:"The update is W + (α / r) · BA = W + 2 · BA. Keeping α fixed when you change r keeps the update size comparable."}],

/* ---------------- LLM Systems deep dive (unit 47) ---------------- */
[47, "Scaling Laws", {type:"est", p:"Training compute is about 6 · N · D FLOPs. For N = 7 billion parameters and D = 2 trillion tokens, how many FLOPs?",
  answer:6 * 7e9 * 2e12, unit:"FLOPs", min:1e18, max:1e27, within:3,
  why:"6 × 7 × 10⁹ × 2 × 10¹² = 8.4 × 10²² FLOPs. At 400 TFLOP/s of useful compute per GPU, that's about 2.4 × 10⁸ GPU-seconds."}],
[47, "KV Cache Math", {type:"dims", p:"One layer's K cache for batch 4, 8 KV heads, 4,096 cached tokens and head dimension 128. What is its shape (batch, heads, tokens, head_dim)?",
  answer:["4","8","4096","128"], chips:["4","8","32","128","4096"],
  why:"One key vector of size 128 per KV head, per cached token, per sequence. The V cache has the same shape."}],
[47, "MQA & GQA", {type:"tf", p:"True or false?",
  cards:[["MQA shares one K/V head across all query heads",true,""],
    ["GQA shrinks the KV cache compared with full multi-head attention",true,""],
    ["GQA reduces the number of query heads",false,"Query heads stay; only K/V heads are shared within groups."],
    ["With 32 query heads and 8 KV heads, the KV cache is 1/4 the size of MHA's",true,""],
    ["MQA's main win is fewer FLOPs, not less memory traffic",false,"Its win is a smaller KV cache to read at every decode step."]],
  why:"Decoding is memory-bound, so shrinking K/V is what speeds it up."}],

/* ---------------- RL deep dive (unit 48) ---------------- */
[48, "Returns & the Discount Horizon", {type:"num", p:"Rewards 1, 1, 1 at the next three steps with γ = 0.9. What is the discounted return G? (2 decimal places)",
  answer:1 + 0.9 + 0.81, tol:0.01, why:"G = 1 + 0.9 · 1 + 0.9² · 1 = 2.71."}],
[48, "The Bellman Equation", {type:"derive", p:"From state s you always get reward 1 and move to s′, where V(s′) = 10. With γ = 0.9, find V(s).",
  items:["V(s) = E[r + γ V(s′)]","Here r = 1 and V(s′) = 10, with γ = 0.9","V(s) = 1 + 0.9 · 10","V(s) = 10"],
  decoys:["V(s) = 0.9 · (1 + 10) = 9.9","V(s) = 1 + 10 = 11"],
  why:"The Bellman equation: value now is reward now plus the discounted value of where you land. Only the future is discounted."}],
[48, "TD Learning & Q-Learning", {type:"num", p:"TD(0): V(s) = 5, reward r = 1, V(s′) = 6, γ = 0.9, α = 0.1. What is the new V(s)? (2 decimal places)",
  answer:5 + 0.1 * (1 + 0.9 * 6 - 5), tol:0.01, why:"TD target = 1 + 0.9 × 6 = 6.4. Error = 6.4 − 5 = 1.4. New V = 5 + 0.1 × 1.4 = 5.14."}],

/* ---------------- RAG Evaluation deep dive (unit 50) ---------------- */
[50, "Retrieval Metrics by Hand", {type:"num", p:"A query has 4 relevant documents. The top 5 results contain 3 of them. What is recall@5?",
  answer:0.75, tol:0.001, why:"Recall@5 = relevant found in the top 5 / all relevant = 3 / 4. Precision@5 would be 3 / 5."}],

/* ---------------- Information Theory deep dive (unit 51) ---------------- */
[51, "Surprise & Entropy", {type:"num", p:"A coin lands heads with probability 0.25. What is its entropy in bits? (2 decimal places)",
  answer:-(0.25 * Math.log2(0.25) + 0.75 * Math.log2(0.75)), tol:0.01,
  why:"H = −(0.25 log₂ 0.25 + 0.75 log₂ 0.75) = 0.5 + 0.311 ≈ 0.81 bits, less than a fair coin's 1 bit."}],
[51, "Cross-Entropy & Perplexity", {type:"derive", p:"A model gives the three true tokens probabilities 0.5, 0.25 and 0.5. Find its perplexity.",
  items:["The true tokens get p = 0.5, 0.25, 0.5","Average negative log₂ likelihood = (1 + 2 + 1) / 3 = 4/3 bits","Perplexity = 2^(4/3) ≈ 2.52"],
  decoys:["Perplexity = average of 1/p = (2 + 4 + 2) / 3 ≈ 2.67","Average negative log₂ likelihood = 0.5 + 0.25 + 0.5"],
  why:"Perplexity is 2 raised to the average surprise: the geometric mean of 1/p, not the arithmetic mean."}],
[51, "KL Divergence", {type:"num", p:"P = (0.5, 0.5) and Q = (0.25, 0.75). What is KL(P ‖ Q) in bits? (2 decimal places)",
  answer:0.5 * Math.log2(0.5 / 0.25) + 0.5 * Math.log2(0.5 / 0.75), tol:0.01,
  why:"0.5 × log₂2 + 0.5 × log₂(2/3) = 0.5 − 0.29 ≈ 0.21 bits. It isn't symmetric: KL(Q ‖ P) is different."}],

/* ---------------- Leakage deep dive (unit 52) ---------------- */
[52, "Four Kinds of Leakage", {type:"bucket", p:"Leak or safe?", buckets:["Leak","Safe"],
  items:[["Fitting the scaler on all data before splitting","Leak"],["Target encoding computed inside each CV fold","Safe"],
    ["A feature counting support tickets in the 30 days AFTER the prediction date","Leak"],["The same patient's scans in both train and test","Leak"],
    ["Imputing missing values with the training set's median","Safe"]],
  why:"Anything learned from test rows, or from the future, makes offline scores look better than production will be."}],
[52, "Fit on Train Only", {type:"bug", p:"Test accuracy here is a little too good. Tap the line that leaks.",
  code:`scaler = StandardScaler()
X_all = scaler.fit_transform(X)
X_train, X_test = X_all[:800], X_all[800:]
model.fit(X_train, y[:800])
print(model.score(X_test, y[800:]))`,
  line:2, fix:{opts:["Split first, fit the scaler on X_train only, then transform both","Use MinMaxScaler instead","Call fit_transform twice"]},
  why:"Fitting on all rows lets the test set's mean and spread shape the training features. Fit preprocessing on train, then apply it to test."}]
];
Q.forEach(([ui, title, q]) => {
  const l = C[ui] && C[ui].ls.find(x => x[0] === title);
  if (l) l[2].push(q);
});
})(window.CURRICULUM);
