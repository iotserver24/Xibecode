export function greeting() {
  return 'hello-alpha';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(greeting());
}
